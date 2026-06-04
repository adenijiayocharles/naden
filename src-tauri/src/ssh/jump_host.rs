use std::io::{Read, Write};
use std::net::TcpStream; // used as the return type of open_tunnel / one_hop
use std::os::unix::io::{FromRawFd, IntoRawFd};
use std::os::unix::net::UnixStream;

use crate::error::AppError;
use crate::ssh::connection::{authenticate_session, verify_host_key, AuthInfo};

#[derive(Clone)]
pub struct JumpInfo {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: AuthInfo,
}

/// ssh2::Session holds a raw pointer and is therefore !Send by default.
/// Wrapping it here lets us move the session (and associated channel) into a
/// proxy thread. Safety: libssh2 sessions are not internally thread-safe, so
/// we never share a session across threads — the proxy thread has exclusive
/// ownership of both the Session and Channel for their entire lifetime.
struct SendSession(ssh2::Session);
// SAFETY: we move ownership to exactly one thread; no sharing takes place.
unsafe impl Send for SendSession {}

struct SendChannel(ssh2::Channel);
// SAFETY: same as SendSession — one thread owns this at a time.
unsafe impl Send for SendChannel {}

/// Opens a TcpStream that tunnels through every hop in `jumps` to `(target_host, target_port)`.
///
/// For each hop we:
///   1. Create an SSH session over the current stream and authenticate.
///   2. Open a `direct-tcpip` channel to the next node.
///   3. Proxy the channel through a Unix socketpair in a background thread
///      (the thread keeps the Session alive for the channel's lifetime).
///   4. Hand the consumer socket end to the next iteration as a new TcpStream.
pub fn open_tunnel(
    jumps: Vec<JumpInfo>,
    target_host: &str,
    target_port: u16,
) -> Result<TcpStream, AppError> {
    assert!(!jumps.is_empty(), "open_tunnel requires at least one jump");

    let first_tcp = crate::ssh::connection::tcp_connect(&jumps[0].host, jumps[0].port)?;

    let mut stream = first_tcp;

    for (i, jump) in jumps.iter().enumerate() {
        let is_last = i + 1 == jumps.len();
        let (next_host, next_port) = if is_last {
            (target_host, target_port)
        } else {
            (jumps[i + 1].host.as_str(), jumps[i + 1].port)
        };
        stream = one_hop(stream, jump, next_host, next_port)?;
    }

    Ok(stream)
}

fn one_hop(
    stream: TcpStream,
    jump: &JumpInfo,
    next_host: &str,
    next_port: u16,
) -> Result<TcpStream, AppError> {
    let mut session =
        ssh2::Session::new().map_err(|e| AppError::Ssh(format!("session create failed: {e}")))?;
    session.set_tcp_stream(stream);
    session
        .handshake()
        .map_err(|e| AppError::Ssh(format!("handshake with {} failed: {e}", jump.host)))?;
    verify_host_key(&session, &jump.host, jump.port)?;
    authenticate_session(&mut session, &jump.username, &jump.auth)
        .map_err(|e| AppError::Ssh(format!("auth to {} failed: {e}", jump.host)))?;

    let channel = session
        .channel_direct_tcpip(next_host, next_port, None)
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("administratively prohibited") || msg.contains("Channel open failure") {
                AppError::Ssh(format!(
                    "The jump host '{}' refused to forward to {next_host}:{next_port}. \
                     Check that AllowTcpForwarding is enabled in the jump host's sshd_config.",
                    jump.host
                ))
            } else {
                AppError::Ssh(format!(
                    "Could not open tunnel through '{}' to {next_host}:{next_port}: {e}",
                    jump.host
                ))
            }
        })?;

    let (proxy_sock, consumer_sock) =
        UnixStream::pair().map_err(|e| AppError::Ssh(format!("socketpair failed: {e}")))?;

    // Move both session and channel into the proxy thread.
    // Drop order inside the thread: channel drops first (declared after session),
    // then session — the correct order for libssh2.
    let ss = SendSession(session);
    let sc = SendChannel(channel);
    std::thread::spawn(move || {
        // catch_unwind ensures the proxy socket is closed (breaking the consumer's
        // read) even if libssh2 panics, rather than leaving the consumer blocked.
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let SendSession(s) = ss;
            s.set_blocking(false);
            let SendChannel(mut c) = sc;
            let mut sock = proxy_sock;
            sock.set_nonblocking(true).unwrap_or_default();

            proxy_loop(&mut c, &mut sock);

            drop(c);
            drop(s);
        }));
    });

    // Convert the consumer Unix socket to a TcpStream by fd.
    // libssh2 only calls read/write/recv/send on the fd; Unix sockets behave
    // identically to TCP sockets for those syscalls.
    let consumer_tcp = unsafe { TcpStream::from_raw_fd(consumer_sock.into_raw_fd()) };
    Ok(consumer_tcp)
}

fn proxy_loop(channel: &mut ssh2::Channel, sock: &mut UnixStream) {
    let mut buf = [0u8; 8192];
    loop {
        let mut active = false;

        match channel.read(&mut buf) {
            // In non-blocking mode libssh2 returns Ok(0) to mean "no data right
            // now", not true EOF. Only close the tunnel when the channel confirms
            // end-of-file; otherwise treat it the same as WouldBlock.
            Ok(0) => {
                if channel.eof() {
                    break;
                }
            }
            Ok(n) => {
                active = true;
                if sock.write_all(&buf[..n]).is_err() {
                    break;
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
            Err(_) => break,
        }

        match sock.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                active = true;
                if channel.write_all(&buf[..n]).is_err() {
                    break;
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
            Err(_) => break,
        }

        if !active {
            std::thread::sleep(std::time::Duration::from_millis(2));
        }
    }
}
