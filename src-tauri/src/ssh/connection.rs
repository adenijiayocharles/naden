use base64::Engine as _;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use zeroize::Zeroizing;

use crate::error::AppError;
use crate::ssh::jump_host::{self, JumpInfo};
use crate::ssh::known_hosts::{verify_host_key_interactive, HostKeyConfirmations};

#[derive(serde::Deserialize)]
struct EnvVar {
    key: String,
    value: String,
}

fn is_valid_env_key(key: &str) -> bool {
    !key.is_empty()
        && !key.starts_with(|c: char| c.is_ascii_digit())
        && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

const CONNECT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);

/// Try every address returned by DNS; succeed on the first that connects.
/// Using connect_timeout avoids the OS default (~75 s on macOS) when a host
/// is firewalled or unreachable.
pub(crate) fn tcp_connect(host: &str, port: u16) -> Result<TcpStream, AppError> {
    use std::net::ToSocketAddrs;
    let addrs: Vec<_> = (host, port)
        .to_socket_addrs()
        .map_err(|e| AppError::Ssh(format!("failed to resolve '{host}': {e}")))?
        .collect();
    if addrs.is_empty() {
        return Err(AppError::Ssh(format!(
            "could not resolve hostname '{host}'"
        )));
    }
    let mut last_err = None;
    for addr in &addrs {
        match TcpStream::connect_timeout(addr, CONNECT_TIMEOUT) {
            Ok(stream) => return Ok(stream),
            Err(e) => last_err = Some(e),
        }
    }
    Err(AppError::Ssh(format!(
        "TCP connect to {host}:{port} failed: {}",
        last_err.expect("addrs was non-empty so at least one Err must exist")
    )))
}

/// Callback invoked when a terminal session ends.
/// Arguments: (outcome: String, error_message: Option<String>)
pub type OnCloseCallback = Box<dyn FnOnce(String, Option<String>) + Send>;

#[derive(Clone)]
pub enum AuthInfo {
    Password(Zeroizing<String>),
    PubKey {
        key_data: Zeroizing<String>,
        passphrase: Option<Zeroizing<String>>,
    },
    Agent,
}

pub(crate) enum SessionMessage {
    Input(Vec<u8>),
    Resize(u16, u16),
    Close,
}

pub(crate) struct ActiveSession {
    tx: std::sync::mpsc::SyncSender<SessionMessage>,
}

/// Pending "confirm this exact hook before running it" prompts, keyed by
/// `session_id`. Lives alongside `host_key_confirmations` since both gate
/// whether a session is allowed to proceed, but uses a `tokio::oneshot`
/// rather than a blocking `mpsc` channel — unlike host-key confirmation,
/// which is awaited from `run_session` on a plain `std::thread`, this one is
/// awaited directly from the async `open_terminal_session` command.
pub type HookConfirmations =
    Arc<tokio::sync::Mutex<HashMap<String, tokio::sync::oneshot::Sender<bool>>>>;

pub struct SessionManager {
    sessions: Arc<Mutex<HashMap<String, ActiveSession>>>,
    pub host_key_confirmations: HostKeyConfirmations,
    pub hook_confirmations: HookConfirmations,
}

pub(crate) fn recover_lock<T>(
    result: std::sync::LockResult<std::sync::MutexGuard<'_, T>>,
) -> std::sync::MutexGuard<'_, T> {
    result.unwrap_or_else(|e| {
        log::warn!("mutex was poisoned; recovering state");
        e.into_inner()
    })
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            host_key_confirmations: Arc::new(Mutex::new(HashMap::new())),
            hook_confirmations: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn open_session(
        &self,
        session_id: String,
        host: String,
        port: u16,
        username: String,
        auth: AuthInfo,
        jump_chain: Vec<JumpInfo>,
        initial_dir: Option<String>,
        env_vars: Option<String>,
        post_disconnect_hook: Option<String>,
        on_close: Option<OnCloseCallback>,
        app_handle: tauri::AppHandle,
        keepalive_interval: u32,
        server_id: String,
    ) -> Result<(), AppError> {
        let (tx, rx) = std::sync::mpsc::sync_channel(256);

        recover_lock(self.sessions.lock()).insert(session_id.clone(), ActiveSession { tx });

        let sessions = Arc::clone(&self.sessions);
        let confirmations = Arc::clone(&self.host_key_confirmations);
        let sid = session_id.clone();

        std::thread::spawn(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                run_session(
                    host,
                    port,
                    username,
                    auth,
                    jump_chain,
                    initial_dir,
                    env_vars,
                    post_disconnect_hook,
                    on_close,
                    sid.clone(),
                    rx,
                    app_handle.clone(),
                    Arc::clone(&sessions),
                    keepalive_interval,
                    confirmations,
                    server_id,
                );
            }));
            if result.is_err() {
                recover_lock(sessions.lock()).remove(&sid);
                let _ = app_handle.emit(&format!("terminal:closed:{sid}"), ());
            }
        });

        Ok(())
    }

    /// Opens a local shell session in a PTY, reusing the same `ActiveSession`/
    /// `SessionMessage` plumbing as `open_session` so `send_input`, `resize`, and
    /// `close_session` work unchanged regardless of session kind.
    pub fn open_local_session(
        &self,
        session_id: String,
        initial_dir: Option<String>,
        app_handle: tauri::AppHandle,
    ) -> Result<(), AppError> {
        let (tx, rx) = std::sync::mpsc::sync_channel(256);

        recover_lock(self.sessions.lock()).insert(session_id.clone(), ActiveSession { tx });

        let sessions = Arc::clone(&self.sessions);
        let sid = session_id.clone();

        std::thread::spawn(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                crate::local_terminal::run_local_session(
                    sid.clone(),
                    initial_dir,
                    rx,
                    app_handle.clone(),
                    Arc::clone(&sessions),
                );
            }));
            if result.is_err() {
                recover_lock(sessions.lock()).remove(&sid);
                let _ = app_handle.emit(&format!("terminal:closed:{sid}"), ());
            }
        });

        Ok(())
    }

    pub fn send_input(&self, session_id: &str, data: Vec<u8>) -> Result<(), AppError> {
        // Clone the sender before releasing the lock so we don't hold the mutex
        // during send(), which blocks when the 256-slot channel is full.
        let tx = {
            let sessions = recover_lock(self.sessions.lock());
            sessions
                .get(session_id)
                .ok_or_else(|| AppError::Ssh(format!("session {session_id} not found")))?
                .tx
                .clone()
        };
        tx.send(SessionMessage::Input(data))
            .map_err(|_| AppError::Ssh("session closed".into()))
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), AppError> {
        let tx = {
            let sessions = recover_lock(self.sessions.lock());
            sessions
                .get(session_id)
                .ok_or_else(|| AppError::Ssh(format!("session {session_id} not found")))?
                .tx
                .clone()
        };
        tx.send(SessionMessage::Resize(cols, rows))
            .map_err(|_| AppError::Ssh("session closed".into()))
    }

    pub fn close_session(&self, session_id: &str) {
        let tx = {
            let sessions = recover_lock(self.sessions.lock());
            sessions.get(session_id).map(|s| s.tx.clone())
        };
        if let Some(tx) = tx {
            let _ = tx.send(SessionMessage::Close);
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
        AuthInfo::PubKey {
            key_data,
            passphrase,
        } => {
            // If the key is passphrase-protected and no passphrase is stored, try the
            // system SSH agent first. On macOS the agent holds keys whose passphrases
            // are stored in the Keychain, so `ssh` in the terminal never prompts —
            // we want the same behaviour.
            if passphrase.is_none() && key_is_encrypted(key_data) {
                if session.userauth_agent(username).is_ok() && session.authenticated() {
                    return Ok(());
                }
                return Err(AppError::Ssh(
                    "This private key is passphrase-protected and the SSH agent does not \
                     have it loaded. Either:\n\
                     • Run `ssh-add ~/.ssh/id_ed25519` to add it to the agent, or\n\
                     • Edit the server and enter the passphrase in the password field."
                        .into(),
                ));
            }

            let pass_str = passphrase.as_ref().map(|p| p.as_str());
            match session.userauth_pubkey_memory(username, None, key_data, pass_str) {
                Ok(()) => {}
                Err(ref e) if matches!(e.code(), ssh2::ErrorCode::Session(-16)) => {
                    return Err(AppError::Ssh(
                        "Could not load the private key. \
                         The passphrase may be incorrect, or the key file may be corrupted."
                            .into(),
                    ));
                }
                Err(e) => return Err(AppError::Ssh(format!("Key auth failed: {e}"))),
            }
        }
        AuthInfo::Agent => {
            let mut agent = session
                .agent()
                .map_err(|e| AppError::Ssh(format!("SSH agent init failed: {e}")))?;
            agent.connect().map_err(|_| {
                AppError::Ssh(
                    "Cannot connect to ssh-agent. \
                     Run `eval \"$(ssh-agent -s)\"` in your shell and try again."
                        .into(),
                )
            })?;
            agent
                .list_identities()
                .map_err(|e| AppError::Ssh(format!("SSH agent list identities failed: {e}")))?;
            for identity in agent
                .identities()
                .map_err(|e| AppError::Ssh(format!("SSH agent identities error: {e}")))?
            {
                if agent.userauth(username, &identity).is_ok() && session.authenticated() {
                    return Ok(());
                }
            }
            return Err(AppError::Ssh(
                "SSH agent authentication failed. \
                 Ensure the correct key is loaded with `ssh-add`."
                    .into(),
            ));
        }
    }
    Ok(())
}

/// Returns `true` if the key material requires a passphrase to decrypt.
///
/// Handles both traditional PEM (looks for the specific header lines that
/// OpenSSL/OpenSSH write for encrypted keys) and the modern OpenSSH binary format
/// (parses the cipher field — "none" means unencrypted, anything else means encrypted).
pub(crate) fn key_is_encrypted(pem: &str) -> bool {
    // Traditional encrypted PEM keys include this header line.
    // Checking for the full "Proc-Type: 4,ENCRYPTED" header avoids false positives
    // from the word "ENCRYPTED" appearing coincidentally in the base64-encoded key body.
    if pem.contains("Proc-Type: 4,ENCRYPTED") {
        return true;
    }
    // PKCS#8 encrypted format uses this specific PEM label.
    if pem.contains("BEGIN ENCRYPTED PRIVATE KEY") {
        return true;
    }
    if !pem.contains("BEGIN OPENSSH PRIVATE KEY") {
        return false;
    }
    // OpenSSH binary format:
    //   "openssh-key-v1\0"  (16 bytes magic)
    //   uint32 + cipher_name
    //   uint32 + kdf_name
    //   ...
    // If cipher_name == "none" the key is unencrypted.
    let b64: String = pem
        .lines()
        .filter(|l| !l.starts_with("-----"))
        .collect::<Vec<_>>()
        .join("");
    let Ok(data) = base64::engine::general_purpose::STANDARD.decode(b64.trim()) else {
        return false;
    };
    const MAGIC: &[u8] = b"openssh-key-v1\0";
    if !data.starts_with(MAGIC) || data.len() < MAGIC.len() + 4 {
        return false;
    }
    let pos = MAGIC.len();
    let cipher_len =
        u32::from_be_bytes([data[pos], data[pos + 1], data[pos + 2], data[pos + 3]]) as usize;
    let cipher_start = pos + 4;
    data.len() >= cipher_start + cipher_len
        && &data[cipher_start..cipher_start + cipher_len] != b"none"
}

#[allow(clippy::too_many_arguments)]
fn run_session(
    host: String,
    port: u16,
    username: String,
    auth: AuthInfo,
    jump_chain: Vec<JumpInfo>,
    initial_dir: Option<String>,
    env_vars: Option<String>,
    post_disconnect_hook: Option<String>,
    on_close: Option<OnCloseCallback>,
    session_id: String,
    rx: std::sync::mpsc::Receiver<SessionMessage>,
    app_handle: tauri::AppHandle,
    sessions: Arc<Mutex<HashMap<String, ActiveSession>>>,
    keepalive_interval: u32,
    host_key_confirmations: HostKeyConfirmations,
    server_id: String,
) {
    let output_event = format!("terminal:output:{session_id}");
    let closed_event = format!("terminal:closed:{session_id}");

    let _ = app_handle.emit(&format!("terminal:status:{session_id}"), "connecting");

    let result: Result<(), AppError> = (|| {
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

        verify_host_key_interactive(
            &session,
            &host,
            port,
            &session_id,
            &app_handle,
            &host_key_confirmations,
        )?;
        authenticate_session(&mut session, &username, &auth)?;
        // Zeroize key material immediately — it is not needed after auth.
        drop(auth);

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

        if let Some(ref dir) = initial_dir {
            // Single-quoted to handle spaces; the shell interprets this before the
            // prompt renders so no visible command appears in the session output.
            let cmd = format!("cd '{}'\n", dir.replace('\'', "'\\''"));
            let _ = channel.write_all(cmd.as_bytes());
        }

        // Export per-server env vars before the prompt appears.
        let parsed_vars: Vec<EnvVar> = env_vars
            .as_deref()
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or_default();
        for var in &parsed_vars {
            if is_valid_env_key(&var.key) {
                // Strip CR/LF — a newline inside the single-quoted value would
                // break out of the export statement and inject arbitrary shell input.
                let safe_value = var.value.replace(['\n', '\r'], "");
                let escaped = safe_value.replace('\'', "'\\''");
                let cmd = format!("export {}='{}'\n", var.key, escaped);
                let _ = channel.write_all(cmd.as_bytes());
            }
        }

        let _ = app_handle.emit(&format!("terminal:status:{session_id}"), "connected");

        if keepalive_interval > 0 {
            session.set_keepalive(true, keepalive_interval);
        }

        session.set_blocking(false);

        let mut buf = vec![0u8; 32768];
        let mut last_keepalive = std::time::Instant::now();

        // Ceiling on how long the leading read below blocks when idle. libssh2
        // selects() on the real socket internally, so this read returns the instant
        // data arrives rather than waiting out a fixed poll interval — the wait only
        // hits this ceiling when the connection is genuinely idle.
        const IDLE_WAIT_MS: u32 = 8;

        'io: loop {
            // Drain SSH channel output, coalescing all available chunks into one emit.
            // The first read blocks briefly (event-driven, bounded by IDLE_WAIT_MS) for
            // new data; the rest of the drain is non-blocking, mopping up whatever else
            // is already buffered.
            let mut coalesced: Vec<u8> = Vec::new();
            let mut first_read = true;
            loop {
                if first_read {
                    session.set_blocking(true);
                    session.set_timeout(IDLE_WAIT_MS);
                }
                let result = channel.read(&mut buf);
                if first_read {
                    session.set_blocking(false);
                    session.set_timeout(0);
                    first_read = false;
                }
                match result {
                    Ok(0) => {
                        // In non-blocking mode libssh2 returns Ok(0) to mean "no data
                        // available right now", not true EOF. Only exit the session
                        // when the channel has confirmed end-of-file.
                        if channel.eof() {
                            if !coalesced.is_empty() {
                                let encoded =
                                    base64::engine::general_purpose::STANDARD.encode(&coalesced);
                                let _ = app_handle.emit(&output_event, encoded);
                            }
                            break 'io;
                        }
                        break;
                    }
                    Ok(n) => {
                        coalesced.extend_from_slice(&buf[..n]);
                    }
                    Err(ref e)
                        if e.kind() == std::io::ErrorKind::WouldBlock
                            || e.kind() == std::io::ErrorKind::TimedOut =>
                    {
                        break;
                    }
                    Err(e) => return Err(AppError::Ssh(format!("Connection lost: {e}"))),
                }
            }
            if !coalesced.is_empty() {
                let encoded = base64::engine::general_purpose::STANDARD.encode(&coalesced);
                let _ = app_handle.emit(&output_event, encoded);
            }

            // Drain user input from the message channel.
            loop {
                match rx.try_recv() {
                    Ok(SessionMessage::Input(data)) => {
                        session.set_blocking(true);
                        session.set_timeout(2000);
                        if let Err(e) = channel.write_all(&data) {
                            return Err(AppError::Ssh(format!(
                                "Failed to send input to remote host: {e}. \
                                 The connection may be slow or unreachable."
                            )));
                        }
                        session.set_blocking(false);
                        // Clear the timeout — a non-zero value leaks into subsequent
                        // non-blocking reads and causes spurious disconnects on slow links.
                        session.set_timeout(0);
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

            // No explicit sleep here: the leading read above already waited
            // (event-driven, bounded by IDLE_WAIT_MS) for new data, so the loop
            // naturally paces itself without polling on a fixed timer.
            if keepalive_interval > 0
                && last_keepalive.elapsed().as_secs() >= u64::from(keepalive_interval)
            {
                session.set_blocking(true);
                session.set_timeout(2000);
                let _ = session.keepalive_send();
                session.set_blocking(false);
                session.set_timeout(0);
                last_keepalive = std::time::Instant::now();
            }
        }

        session.set_blocking(true);
        session.set_timeout(3000);
        let _ = channel.send_eof();
        let _ = channel.wait_close();
        drop(channel);
        let _ = session.disconnect(None, "session closed", None);

        Ok(())
    })();

    recover_lock(sessions.lock()).remove(&session_id);

    let (outcome, error_msg) = match &result {
        Ok(()) => ("user_closed".to_string(), None),
        Err(e) => ("failure".to_string(), Some(e.to_string())),
    };

    if let Some(cb) = on_close {
        cb(outcome, error_msg.clone());
    }

    // Fire-and-forget: spawn post-disconnect hook in background so session
    // cleanup is not blocked. The hook receives context via env vars.
    const MAX_HOOK_LEN: usize = 4096;
    const POST_HOOK_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);
    if let Some(hook) = post_disconnect_hook {
        let hook = hook.trim().to_string();
        if !hook.is_empty() && hook.len() <= MAX_HOOK_LEN {
            let h = host.clone();
            let u = username.clone();
            let p = port;
            let sid = server_id.clone();
            std::thread::spawn(move || {
                if let Ok(mut child) = std::process::Command::new("sh")
                    .arg("-c")
                    .arg(&hook)
                    .env("NADEN_HOST", &h)
                    .env("NADEN_PORT", p.to_string())
                    .env("NADEN_USER", &u)
                    .env("NADEN_SERVER_ID", &sid)
                    .spawn()
                {
                    let deadline = std::time::Instant::now() + POST_HOOK_TIMEOUT;
                    loop {
                        match child.try_wait() {
                            Ok(Some(_)) => break,
                            Ok(None) if std::time::Instant::now() >= deadline => {
                                let _ = child.kill();
                                break;
                            }
                            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(50)),
                            Err(_) => break,
                        }
                    }
                }
            });
        }
    }

    if let Some(msg) = error_msg {
        let _ = app_handle.emit(&format!("terminal:error:{session_id}"), msg);
    }

    // Payload: true = clean exit (user typed `exit`), false = unexpected drop.
    let _ = app_handle.emit(&closed_event, result.is_ok());
}
