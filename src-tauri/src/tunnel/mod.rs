// SSH port-forwarding engine.
//
// Each active port forward owns one dedicated SSH session (independent of any
// terminal session). Connections through a forward are handled serially: one
// active client at a time. This covers 95 % of real-world use-cases (database
// tunnel, single-tab SOCKS proxy) without the complexity of concurrent sessions.
//
// Shutdown uses an AtomicBool: the worker checks it on each accept() timeout.

pub(crate) mod dynamic;
pub(crate) mod local;
pub(crate) mod remote;
mod tests;

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::Emitter;

use crate::error::AppError;
use crate::models::port_forward::PortForward;
use crate::ssh::{
    connection::{authenticate_session, tcp_connect, verify_host_key, AuthInfo},
    jump_host::{self, JumpInfo},
};

// ── Event payload emitted on tunnel:status:{forward_id} ─────────────────────

#[derive(Serialize, Clone)]
pub(crate) struct TunnelEvent {
    pub status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub(crate) fn emit_status(
    app: &tauri::AppHandle,
    forward_id: &str,
    status: &'static str,
    error: Option<String>,
) {
    let _ = app.emit(
        &format!("tunnel:status:{forward_id}"),
        TunnelEvent { status, error },
    );
}

// ── TunnelManager ─────────────────────────────────────────────────────────────

struct ActiveTunnel {
    shutdown: Arc<AtomicBool>,
}

/// Bundles the SSH connection details needed to establish a tunnel session.
pub struct TunnelTarget {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: AuthInfo,
    pub jump_chain: Vec<JumpInfo>,
}

pub struct TunnelManager {
    tunnels: Arc<Mutex<HashMap<String, ActiveTunnel>>>,
}

impl TunnelManager {
    pub fn new() -> Self {
        Self {
            tunnels: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Starts `fwd` in a background thread. Returns immediately; status changes
    /// arrive as `tunnel:status:{forward_id}` Tauri events.
    pub fn start(
        &self,
        fwd: PortForward,
        target: TunnelTarget,
        app: tauri::AppHandle,
    ) -> Result<(), AppError> {
        let fid = fwd.id.clone();
        let shutdown = Arc::new(AtomicBool::new(false));
        let tunnels = Arc::clone(&self.tunnels);
        let sd = Arc::clone(&shutdown);

        {
            let mut map = tunnels.lock().unwrap();
            if map.contains_key(&fid) {
                return Err(AppError::Validation(format!(
                    "tunnel '{fid}' is already active"
                )));
            }
            map.insert(fid.clone(), ActiveTunnel { shutdown });
        }

        std::thread::spawn(move || {
            emit_status(&app, &fid, "connecting", None);

            let result = run_session(fwd, target, sd, &app, &fid);

            tunnels.lock().unwrap().remove(&fid);

            match result {
                Ok(()) => emit_status(&app, &fid, "stopped", None),
                Err(e) => emit_status(&app, &fid, "error", Some(e.to_string())),
            }
        });

        Ok(())
    }

    /// Signals the worker to stop. The thread will finish the current client
    /// interaction, then exit on the next accept-loop iteration.
    pub fn stop(&self, forward_id: &str) -> Result<(), AppError> {
        match self.tunnels.lock().unwrap().get(forward_id) {
            Some(t) => {
                t.shutdown.store(true, Ordering::Relaxed);
                Ok(())
            }
            None => Err(AppError::NotFound(format!(
                "tunnel '{forward_id}' is not active"
            ))),
        }
    }

    pub fn active_ids(&self) -> Vec<String> {
        self.tunnels.lock().unwrap().keys().cloned().collect()
    }

    pub fn is_active(&self, forward_id: &str) -> bool {
        self.tunnels.lock().unwrap().contains_key(forward_id)
    }
}

// ── Session setup + forward dispatch ─────────────────────────────────────────

fn run_session(
    fwd: PortForward,
    target: TunnelTarget,
    shutdown: Arc<AtomicBool>,
    app: &tauri::AppHandle,
    forward_id: &str,
) -> Result<(), AppError> {
    let TunnelTarget {
        host,
        port,
        username,
        auth,
        jump_chain,
    } = target;

    let stream = if jump_chain.is_empty() {
        tcp_connect(&host, port)?
    } else {
        jump_host::open_tunnel(jump_chain, &host, port)?
    };

    let mut session = ssh2::Session::new()
        .map_err(|e| AppError::Ssh(format!("SSH session create failed: {e}")))?;
    session.set_tcp_stream(stream);
    session
        .handshake()
        .map_err(|e| AppError::Ssh(format!("SSH handshake with {host} failed: {e}")))?;

    verify_host_key(&session, &host, port)?;
    authenticate_session(&mut session, &username, &auth)?;
    drop(auth); // zeroize key material

    if !session.authenticated() {
        return Err(AppError::Ssh("authentication failed".into()));
    }

    emit_status(app, forward_id, "active", None);

    match fwd.forward_type.as_str() {
        "local" => local::run(session, &fwd, shutdown),
        "dynamic" => dynamic::run(session, &fwd, shutdown),
        "remote" => remote::run(session, &fwd, shutdown),
        t => Err(AppError::Validation(format!("unknown forward type: {t}"))),
    }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/// Binds a non-blocking TCP listener on 127.0.0.1:{port}.
pub(crate) fn bind_local_listener(port: i64) -> Result<std::net::TcpListener, AppError> {
    let listener = std::net::TcpListener::bind(format!("127.0.0.1:{port}"))
        .map_err(|e| AppError::Ssh(format!("cannot bind 127.0.0.1:{port}: {e}")))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| AppError::Ssh(format!("set_nonblocking: {e}")))?;
    Ok(listener)
}

// ── Shared proxy loop ─────────────────────────────────────────────────────────

/// Bidirectional proxy between an ssh2 Channel and a plain TcpStream.
/// Both must already be in non-blocking mode before this is called.
pub(crate) fn proxy_channel_tcp(channel: &mut ssh2::Channel, stream: &mut TcpStream) {
    let mut buf = [0u8; 8192];
    loop {
        let mut active = false;

        match channel.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                active = true;
                if stream.write_all(&buf[..n]).is_err() {
                    break;
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
            Err(_) => break,
        }

        match stream.read(&mut buf) {
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
            // 15ms matches the terminal session idle sleep and keeps CPU burn
            // proportional: ~67 wakeups/sec vs ~500 at 2ms, with no perceptible
            // latency difference for interactive use (TCP receive buffers absorb it).
            std::thread::sleep(std::time::Duration::from_millis(15));
        }
    }
}
