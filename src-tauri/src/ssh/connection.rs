use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::{Arc, Mutex};
use base64::Engine as _;
use tauri::Emitter;
use uuid::Uuid;

use crate::error::AppError;
use crate::ssh::jump_host::{self, JumpInfo};

const CONNECT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);

/// Resolve `host` and open a TCP connection with a fixed timeout.
/// Using connect_timeout avoids the OS default (~75 s on macOS) when a host
/// is firewalled or unreachable.
pub(crate) fn tcp_connect(host: &str, port: u16) -> Result<TcpStream, AppError> {
    use std::net::ToSocketAddrs;
    let addr = (host, port)
        .to_socket_addrs()
        .map_err(|e| AppError::Ssh(format!("failed to resolve '{host}': {e}")))?
        .next()
        .ok_or_else(|| AppError::Ssh(format!("could not resolve hostname '{host}'")))?;
    TcpStream::connect_timeout(&addr, CONNECT_TIMEOUT)
        .map_err(|e| AppError::Ssh(format!("TCP connect to {host}:{port} failed: {e}")))
}

/// Callback invoked when a terminal session ends.
/// Arguments: (outcome: String, error_message: Option<String>)
pub type OnCloseCallback = Box<dyn FnOnce(String, Option<String>) + Send>;

pub enum AuthInfo {
    Password(String),
    PubKey { key_data: String, passphrase: Option<String> },
}

enum SessionMessage {
    Input(Vec<u8>),
    Resize(u16, u16),
    Close,
}

struct ActiveSession {
    tx: std::sync::mpsc::SyncSender<SessionMessage>,
}

pub struct SessionManager {
    sessions: Arc<Mutex<HashMap<String, ActiveSession>>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn open_session(
        &self,
        host: String,
        port: u16,
        username: String,
        auth: AuthInfo,
        jump_chain: Vec<JumpInfo>,
        server_name: String,
        on_close: Option<OnCloseCallback>,
        app_handle: tauri::AppHandle,
    ) -> Result<String, AppError> {
        let session_id = Uuid::new_v4().to_string();
        let (tx, rx) = std::sync::mpsc::sync_channel(256);

        self.sessions
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(session_id.clone(), ActiveSession { tx });

        let sessions = Arc::clone(&self.sessions);
        let sid = session_id.clone();

        std::thread::spawn(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                run_session(
                    host, port, username, auth, jump_chain,
                    server_name, on_close, sid.clone(), rx, app_handle.clone(), Arc::clone(&sessions),
                );
            }));
            if result.is_err() {
                sessions.lock().unwrap_or_else(|e| e.into_inner()).remove(&sid);
                let _ = app_handle.emit(&format!("terminal:closed:{sid}"), ());
            }
        });

        Ok(session_id)
    }

    pub fn send_input(&self, session_id: &str, data: Vec<u8>) -> Result<(), AppError> {
        let sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
        let session = sessions
            .get(session_id)
            .ok_or_else(|| AppError::Ssh(format!("session {session_id} not found")))?;
        session
            .tx
            .send(SessionMessage::Input(data))
            .map_err(|_| AppError::Ssh("session closed".into()))
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), AppError> {
        let sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
        let session = sessions
            .get(session_id)
            .ok_or_else(|| AppError::Ssh(format!("session {session_id} not found")))?;
        session
            .tx
            .send(SessionMessage::Resize(cols, rows))
            .map_err(|_| AppError::Ssh("session closed".into()))
    }

    pub fn close_session(&self, session_id: &str) {
        let sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(session) = sessions.get(session_id) {
            let _ = session.tx.send(SessionMessage::Close);
        }
    }
}

/// Authenticate `session` for `username` using `auth`.
/// Used by both the main session and jump-host hops.
pub fn authenticate_session(
    session: &mut ssh2::Session,
    username: &str,
    auth: &AuthInfo,
) -> Result<(), AppError> {
    match auth {
        AuthInfo::Password(pass) => {
            session
                .userauth_password(username, pass)
                .map_err(|e| AppError::Ssh(format!("Password auth failed: {e}")))?;
        }
        AuthInfo::PubKey { key_data, passphrase } => {
            match session.userauth_pubkey_memory(username, None, key_data, passphrase.as_deref()) {
                Ok(()) => {}
                // LIBSSH2_ERROR_FILE (-16): key format not supported by libssh2.
                Err(ref e) if matches!(e.code(), ssh2::ErrorCode::Session(-16)) => {
                    return Err(AppError::Ssh(
                        "Private key format not supported. OpenSSH keys require libssh2 ≥1.9 \
                         compiled with OpenSSL. Try converting the key: \
                         ssh-keygen -p -m PEM -f <keyfile>"
                            .into(),
                    ));
                }
                Err(e) => return Err(AppError::Ssh(format!("Key auth failed: {e}"))),
            }
        }
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn run_session(
    host: String,
    port: u16,
    username: String,
    auth: AuthInfo,
    jump_chain: Vec<JumpInfo>,
    _server_name: String,
    on_close: Option<OnCloseCallback>,
    session_id: String,
    rx: std::sync::mpsc::Receiver<SessionMessage>,
    app_handle: tauri::AppHandle,
    sessions: Arc<Mutex<HashMap<String, ActiveSession>>>,
) {
    let output_event = format!("terminal:output:{session_id}");
    let closed_event = format!("terminal:closed:{session_id}");

    let _ = app_handle.emit(&format!("terminal:status:{session_id}"), "connecting");

    let result: Result<(), AppError> = (|| {
        // Build the TCP stream: either a direct connection or a jump-host tunnel.
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
            .map_err(|e| AppError::Ssh(format!("SSH handshake failed: {e}")))?;

        authenticate_session(&mut session, &username, &auth)?;

        if !session.authenticated() {
            return Err(AppError::Ssh("Authentication failed".into()));
        }

        let mut channel = session
            .channel_session()
            .map_err(|e| AppError::Ssh(format!("Channel open failed: {e}")))?;
        channel
            .request_pty("xterm-256color", None, Some((80, 24, 0, 0)))
            .map_err(|e| AppError::Ssh(format!("PTY request failed: {e}")))?;
        channel
            .shell()
            .map_err(|e| AppError::Ssh(format!("Shell request failed: {e}")))?;

        let _ = app_handle.emit(&format!("terminal:status:{session_id}"), "connected");

        session.set_blocking(false);

        let mut buf = vec![0u8; 4096];
        let poll_interval = std::time::Duration::from_millis(5);

        'io: loop {
            loop {
                match channel.read(&mut buf) {
                    Ok(0) => break 'io,
                    Ok(n) => {
                        let encoded =
                            base64::engine::general_purpose::STANDARD.encode(&buf[..n]);
                        let _ = app_handle.emit(&output_event, encoded);
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => break,
                    Err(_) => break 'io,
                }
            }

            loop {
                match rx.try_recv() {
                    Ok(SessionMessage::Input(data)) => {
                        session.set_blocking(true);
                        session.set_timeout(2000);
                        if channel.write_all(&data).is_err() {
                            break 'io;
                        }
                        session.set_blocking(false);
                    }
                    Ok(SessionMessage::Resize(cols, rows)) => {
                        let _ = channel.request_pty_size(cols.into(), rows.into(), None, None);
                    }
                    Ok(SessionMessage::Close)
                    | Err(std::sync::mpsc::TryRecvError::Disconnected) => break 'io,
                    Err(std::sync::mpsc::TryRecvError::Empty) => break,
                }
            }

            if channel.eof() {
                break;
            }

            std::thread::sleep(poll_interval);
        }

        session.set_blocking(true);
        session.set_timeout(3000);
        let _ = channel.send_eof();
        let _ = channel.wait_close();
        drop(channel);
        let _ = session.disconnect(None, "session closed", None);

        Ok(())
    })();

    sessions.lock().unwrap_or_else(|e| e.into_inner()).remove(&session_id);

    // Determine outcome and invoke the audit callback before emitting events
    let (outcome, error_msg) = match &result {
        Ok(()) => ("user_closed".to_string(), None),
        Err(e) => ("failure".to_string(), Some(e.to_string())),
    };

    if let Some(cb) = on_close {
        cb(outcome, error_msg.clone());
    }

    if let Some(msg) = error_msg {
        let _ = app_handle.emit(&format!("terminal:error:{session_id}"), msg);
    }

    let _ = app_handle.emit(&closed_event, ());
}
