// Dynamic SOCKS5 proxy: -D local_port
//
// Binds a TCP listener on localhost:local_port. For each accepted client,
// performs the SOCKS5 handshake to learn the target host:port, then opens a
// direct-tcpip channel through the SSH session and proxies bidirectionally.
//
// Only supports CONNECT (0x01) with no-auth (0x00). UDP ASSOCIATE and BIND
// are rejected — they cover < 1 % of real-world SOCKS5 use-cases.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use super::proxy_channel_tcp;
use crate::error::AppError;
use crate::models::port_forward::PortForward;

pub(crate) fn run(
    session: ssh2::Session,
    fwd: &PortForward,
    shutdown: Arc<AtomicBool>,
) -> Result<(), AppError> {
    let listener = super::bind_local_listener(fwd.local_port)?;

    loop {
        if shutdown.load(Ordering::Relaxed) {
            break;
        }

        match listener.accept() {
            Ok((mut client, _)) => {
                // SOCKS5 handshake runs in blocking mode.
                client
                    .set_nonblocking(false)
                    .map_err(|e| AppError::Ssh(format!("client set_blocking: {e}")))?;
                client
                    .set_read_timeout(Some(std::time::Duration::from_secs(5)))
                    .ok();

                // Parse the SOCKS5 request without sending the success reply yet.
                let (target_host, target_port) = match socks5_negotiate(&mut client) {
                    Ok(v) => v,
                    Err(e) => {
                        log::warn!("[tunnel/dynamic] SOCKS5 handshake failed: {e}");
                        continue;
                    }
                };

                // Open the SSH channel *before* telling the client we succeeded.
                // This prevents sending a false "connected" response when the
                // remote target is unreachable.
                session.set_blocking(true);
                let mut channel = match session.channel_direct_tcpip(
                    &target_host,
                    target_port,
                    None,
                ) {
                    Ok(c) => c,
                    Err(e) => {
                        // Inform the client of the failure (connection refused / unreachable).
                        let _ = client.write_all(&[0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);
                        log::warn!(
                            "[tunnel/dynamic] direct-tcpip to {target_host}:{target_port} failed: {e}"
                        );
                        continue;
                    }
                };

                // Channel is open — now send the SOCKS5 success reply.
                if client
                    .write_all(&[0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
                    .is_err()
                {
                    continue;
                }

                // Switch both ends to non-blocking for the proxy loop.
                session.set_blocking(false);
                client.set_nonblocking(true).ok();
                client.set_read_timeout(None).ok();

                proxy_channel_tcp(&mut channel, &mut client);

                session.set_blocking(true);
                drop(channel);
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Err(_) => break,
        }
    }

    Ok(())
}

/// Reads the SOCKS5 greeting and CONNECT request from `stream`.
/// Returns `(target_host, target_port)` on success.
/// Does NOT send the success reply — caller must do that after the channel is open.
/// Sends error replies inline when the request is unsupported or malformed.
pub(crate) fn socks5_negotiate(stream: &mut TcpStream) -> Result<(String, u16), AppError> {
    // ── Greeting ─────────────────────────────────────────────────────────────
    // +----+----------+----------+
    // | 05 | NMETHODS | METHODS… |
    // +----+----------+----------+
    let mut hdr = [0u8; 2];
    stream
        .read_exact(&mut hdr)
        .map_err(|e| AppError::Ssh(format!("SOCKS5 greeting read: {e}")))?;

    if hdr[0] != 0x05 {
        return Err(AppError::Ssh(format!(
            "not a SOCKS5 client (version byte: {:#x})",
            hdr[0]
        )));
    }

    let n_methods = hdr[1] as usize;
    let mut methods = vec![0u8; n_methods];
    stream
        .read_exact(&mut methods)
        .map_err(|e| AppError::Ssh(format!("SOCKS5 methods read: {e}")))?;

    // We only offer no-auth (0x00). Reject if client didn't include it.
    if !methods.contains(&0x00) {
        let _ = stream.write_all(&[0x05, 0xFF]); // no acceptable method
        return Err(AppError::Ssh(
            "SOCKS5 client requires authentication; only no-auth is supported".into(),
        ));
    }
    stream
        .write_all(&[0x05, 0x00])
        .map_err(|e| AppError::Ssh(format!("SOCKS5 method reply: {e}")))?;

    // ── Request ───────────────────────────────────────────────────────────────
    // +----+-----+-------+------+----------+----------+
    // | 05 | CMD | 0x00  | ATYP | DST.ADDR | DST.PORT |
    // +----+-----+-------+------+----------+----------+
    let mut req_hdr = [0u8; 4];
    stream
        .read_exact(&mut req_hdr)
        .map_err(|e| AppError::Ssh(format!("SOCKS5 request header: {e}")))?;

    if req_hdr[0] != 0x05 {
        return Err(AppError::Ssh("malformed SOCKS5 request".into()));
    }
    if req_hdr[1] != 0x01 {
        // Only CONNECT (0x01) supported; reject BIND / UDP ASSOCIATE.
        let _ = stream.write_all(&[0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);
        return Err(AppError::Ssh(format!(
            "SOCKS5 command {:#x} not supported (only CONNECT)",
            req_hdr[1]
        )));
    }

    let atyp = req_hdr[3];
    let target_host = match atyp {
        0x01 => {
            // IPv4 — 4 bytes
            let mut ip = [0u8; 4];
            stream
                .read_exact(&mut ip)
                .map_err(|e| AppError::Ssh(format!("SOCKS5 IPv4 addr: {e}")))?;
            format!("{}.{}.{}.{}", ip[0], ip[1], ip[2], ip[3])
        }
        0x03 => {
            // Domain name — 1-byte length prefix
            let mut len = [0u8; 1];
            stream
                .read_exact(&mut len)
                .map_err(|e| AppError::Ssh(format!("SOCKS5 domain length: {e}")))?;
            let mut domain = vec![0u8; len[0] as usize];
            stream
                .read_exact(&mut domain)
                .map_err(|e| AppError::Ssh(format!("SOCKS5 domain: {e}")))?;
            String::from_utf8(domain)
                .map_err(|_| AppError::Ssh("SOCKS5 domain is not valid UTF-8".into()))?
        }
        0x04 => {
            // IPv6 — 16 bytes
            let mut ip = [0u8; 16];
            stream
                .read_exact(&mut ip)
                .map_err(|e| AppError::Ssh(format!("SOCKS5 IPv6 addr: {e}")))?;
            let addr = std::net::Ipv6Addr::from(ip);
            format!("{addr}")
        }
        _ => {
            let _ = stream.write_all(&[0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);
            return Err(AppError::Ssh(format!("SOCKS5 unknown ATYP: {atyp:#x}")));
        }
    };

    let mut port_bytes = [0u8; 2];
    stream
        .read_exact(&mut port_bytes)
        .map_err(|e| AppError::Ssh(format!("SOCKS5 port: {e}")))?;
    let target_port = u16::from_be_bytes(port_bytes);
    Ok((target_host, target_port))
}
