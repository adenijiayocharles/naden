// Remote port forward: -R remote_port:local_host:local_port
//
// Asks the SSH server to bind remote_port and forward each incoming connection
// back to local_host:local_port on this machine.

use std::net::TcpStream;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use super::proxy_channel_tcp;
use crate::error::AppError;
use crate::models::port_forward::PortForward;

// LIBSSH2_ERROR_EAGAIN — libssh2's non-blocking "try again" code.
const LIBSSH2_ERROR_EAGAIN: i32 = -37;

pub(crate) fn run(
    session: ssh2::Session,
    fwd: &PortForward,
    shutdown: Arc<AtomicBool>,
) -> Result<(), AppError> {
    let remote_port = u16::try_from(fwd.remote_port).unwrap_or(0);
    // NOTE: for remote forwards, `remote_host` in the data model stores what is
    // conceptually the *local* destination host (i.e. the machine-side target of
    // the inbound connection).  The field name is correct for local/dynamic types
    // but inverted in meaning here.  No migration is planned; keep this comment
    // at the read-site to spare future readers the confusion.
    let local_host = if fwd.remote_host.is_empty() {
        "127.0.0.1".to_string()
    } else {
        fwd.remote_host.clone()
    };
    let local_port = u16::try_from(fwd.local_port).unwrap_or(0);

    // Ask the server to start listening. Returns (Listener, bound_port).
    let (mut listener, _bound) = session
        .channel_forward_listen(remote_port, None, None)
        .map_err(|e| {
            AppError::Ssh(format!(
                "channel_forward_listen for remote port {remote_port} failed: {e}"
            ))
        })?;

    // Non-blocking so the shutdown flag can be checked between accept() calls.
    session.set_blocking(false);

    loop {
        if shutdown.load(Ordering::Relaxed) {
            break;
        }

        match listener.accept() {
            Ok(mut channel) => {
                let addr = format!("{local_host}:{local_port}");
                session.set_blocking(true);
                let mut local_stream = match TcpStream::connect(&addr) {
                    Ok(s) => s,
                    Err(e) => {
                        log::warn!("[tunnel/remote] connect to {addr} failed: {e}");
                        session.set_blocking(false);
                        continue;
                    }
                };

                session.set_blocking(false);
                local_stream.set_nonblocking(true).ok();

                proxy_channel_tcp(&mut channel, &mut local_stream);

                // Drop channel before next accept() iteration.
                session.set_blocking(true);
                drop(channel);
                session.set_blocking(false);
            }
            Err(ref e) if matches!(e.code(), ssh2::ErrorCode::Session(LIBSSH2_ERROR_EAGAIN)) => {
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Err(e) => {
                return Err(AppError::Ssh(format!("accept_forward failed: {e}")));
            }
        }
    }

    Ok(())
}
