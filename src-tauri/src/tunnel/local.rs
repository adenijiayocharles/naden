// Local port forward: -L local_port:remote_host:remote_port
//
// Binds a TCP listener on localhost:local_port. For each accepted client,
// opens a direct-tcpip channel to remote_host:remote_port and proxies
// bidirectionally until the connection closes.

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

    let remote_host = fwd.remote_host.clone();
    let remote_port = u16::try_from(fwd.remote_port).unwrap_or(0);

    loop {
        if shutdown.load(Ordering::Relaxed) {
            break;
        }

        match listener.accept() {
            Ok((mut client, _)) => {
                // Open the SSH tunnel channel (blocking mode for the handshake).
                session.set_blocking(true);
                let mut channel = session
                    .channel_direct_tcpip(&remote_host, remote_port, None)
                    .map_err(|e| {
                        AppError::Ssh(format!(
                            "direct-tcpip to {remote_host}:{remote_port} failed: {e}"
                        ))
                    })?;

                // Switch to non-blocking for the data loop.
                session.set_blocking(false);
                client
                    .set_nonblocking(true)
                    .map_err(|e| AppError::Ssh(format!("client set_nonblocking: {e}")))?;

                proxy_channel_tcp(&mut channel, &mut client);

                // Restore blocking for the next channel_direct_tcpip call.
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
