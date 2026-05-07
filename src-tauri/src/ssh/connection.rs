use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::{Arc, Mutex};
use base64::Engine as _;
use tauri::Emitter;
use uuid::Uuid;

use crate::error::AppError;
use crate::ssh::jump_host::{self, JumpInfo};

pub enum AuthInfo {
    Password(String),
    PubKey { key_data: String, passphrase: Option<String> },
    Agent,
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
        app_handle: tauri::AppHandle,
    ) -> Result<String, AppError> {
        let session_id = Uuid::new_v4().to_string();
        let (tx, rx) = std::sync::mpsc::sync_channel(256);

        self.sessions
            .lock()
            .unwrap()
            .insert(session_id.clone(), ActiveSession { tx });

        let sessions = Arc::clone(&self.sessions);
        let sid = session_id.clone();

        std::thread::spawn(move || {
            run_session(
                host, port, username, auth, jump_chain,
                server_name, sid, rx, app_handle, sessions,
            );
        });

        Ok(session_id)
    }

    pub fn send_input(&self, session_id: &str, data: Vec<u8>) -> Result<(), AppError> {
        let sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| AppError::Ssh(format!("session {session_id} not found")))?;
        session
            .tx
            .send(SessionMessage::Input(data))
            .map_err(|_| AppError::Ssh("session closed".into()))
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), AppError> {
        let sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| AppError::Ssh(format!("session {session_id} not found")))?;
        session
            .tx
            .send(SessionMessage::Resize(cols, rows))
            .map_err(|_| AppError::Ssh("session closed".into()))
    }

    pub fn close_session(&self, session_id: &str) {
        let sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.get(session_id) {
            let _ = session.tx.send(SessionMessage::Close);
        }
    }
}

fn auth_via_agent(session: &mut ssh2::Session, username: &str) -> Result<(), ssh2::Error> {
    let mut agent = session.agent()?;
    agent.connect()?;
    agent.list_identities()?;
    for identity in agent.identities()? {
        if agent.userauth(username, &identity).is_ok() {
            return Ok(());
        }
    }
    Err(ssh2::Error::new(
        ssh2::ErrorCode::Session(-18),
        "no matching key found in SSH agent",
    ))
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
                // LIBSSH2_ERROR_FILE (-16): key format unsupported; fall back to agent.
                Err(ref e) if matches!(e.code(), ssh2::ErrorCode::Session(-16)) => {
                    auth_via_agent(session, username).map_err(|_| {
                        AppError::Ssh(
                            "Private key format not supported by the local libssh2 \
                             (OpenSSH format requires libssh2 ≥1.9 + OpenSSL). \
                             Add the key to your SSH agent (`ssh-add <keyfile>`) \
                             and set the server auth method to 'Agent'."
                                .into(),
                        )
                    })?;
                }
                Err(e) => return Err(AppError::Ssh(format!("Key auth failed: {e}"))),
            }
        }
        AuthInfo::Agent => {
            auth_via_agent(session, username)
                .map_err(|e| AppError::Ssh(format!("Agent auth failed: {e}")))?;
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
            TcpStream::connect((host.as_str(), port))
                .map_err(|e| AppError::Ssh(format!("TCP connect failed: {e}")))?
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
                        let _ = channel.write_all(&data);
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

    sessions.lock().unwrap().remove(&session_id);

    if let Err(ref e) = result {
        let _ = app_handle.emit(&format!("terminal:error:{session_id}"), e.to_string());
    }

    let _ = app_handle.emit(&closed_event, ());
}
