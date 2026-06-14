use base64::Engine as _;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use zeroize::Zeroizing;

use crate::error::AppError;
use crate::ssh::jump_host::{self, JumpInfo};

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
        last_err.unwrap()
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
}

pub(crate) fn known_hosts_path() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    std::path::Path::new(&home).join(".ssh").join("known_hosts")
}

/// In-memory cache of ~/.ssh/known_hosts contents, keyed by the file's mtime.
/// Every SSH connection (including each jump-host hop) calls `verify_host_key`,
/// which otherwise re-reads and re-parses this file from disk every time.
static KNOWN_HOSTS_CACHE: Mutex<Option<(std::time::SystemTime, String)>> = Mutex::new(None);

/// Invalidate the known_hosts cache so the next `verify_host_key` call re-reads
/// the file from disk. Called after any write to known_hosts (TOFU add, removal).
fn invalidate_known_hosts_cache() {
    *recover_lock(KNOWN_HOSTS_CACHE.lock()) = None;
}

/// Load known_hosts entries into `known_hosts`, using the in-memory cache when
/// the file's mtime matches, and refreshing the cache on a cache miss.
fn load_known_hosts_cached(known_hosts: &mut ssh2::KnownHosts, path: &std::path::Path) {
    let mtime = std::fs::metadata(path).and_then(|m| m.modified()).ok();

    let cached = mtime.and_then(|mtime| {
        recover_lock(KNOWN_HOSTS_CACHE.lock())
            .as_ref()
            .filter(|(cached_mtime, _)| *cached_mtime == mtime)
            .map(|(_, content)| content.clone())
    });

    let content = match cached {
        Some(content) => content,
        None => {
            let Ok(content) = std::fs::read_to_string(path) else {
                return;
            };
            if let Some(mtime) = mtime {
                *recover_lock(KNOWN_HOSTS_CACHE.lock()) = Some((mtime, content.clone()));
            }
            content
        }
    };

    // `read_str` (libssh2_knownhost_readline) parses a single line per call.
    for line in content.lines().filter(|l| !l.trim().is_empty()) {
        let _ = known_hosts.read_str(line, ssh2::KnownHostFileKind::OpenSSH);
    }
}

/// Check the server's host key against ~/.ssh/known_hosts.
/// On first contact (NotFound) the key is added (TOFU). Mismatches are rejected.
pub(crate) fn verify_host_key(
    session: &ssh2::Session,
    host: &str,
    port: u16,
) -> Result<(), AppError> {
    let mut known_hosts = session
        .known_hosts()
        .map_err(|e| AppError::Ssh(format!("known_hosts init failed: {e}")))?;

    let path = known_hosts_path();
    if path.exists() {
        load_known_hosts_cached(&mut known_hosts, &path);
    }

    let (key, key_type) = session
        .host_key()
        .ok_or_else(|| AppError::Ssh(format!("server {host}:{port} sent no host key")))?;

    match known_hosts.check_port(host, port, key) {
        ssh2::CheckResult::Match => {}
        ssh2::CheckResult::NotFound => {
            // Trust On First Use: record the key for future connections.
            let entry = if port == 22 {
                host.to_string()
            } else {
                format!("[{host}]:{port}")
            };
            known_hosts
                .add(&entry, key, "", ssh2::KnownHostKeyFormat::from(key_type))
                .map_err(|e| AppError::Ssh(format!("known_hosts add failed: {e}")))?;
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = known_hosts.write_file(&path, ssh2::KnownHostFileKind::OpenSSH);
            invalidate_known_hosts_cache();
        }
        ssh2::CheckResult::Mismatch => {
            return Err(AppError::Ssh(format!(
                "Host key mismatch for {host}:{port}. \
                 The server's key has changed — this may indicate a MITM attack. \
                 If the server was reinstalled, remove its old entry from ~/.ssh/known_hosts."
            )));
        }
        ssh2::CheckResult::Failure => {
            return Err(AppError::Ssh(format!(
                "Host key check failed for {host}:{port}"
            )));
        }
    }
    Ok(())
}

/// Remove all known_hosts entries matching `host`/`port`, as added by
/// `verify_host_key`'s TOFU path. Used to recover from a host-key mismatch
/// after confirming the new key out-of-band (e.g. the server was reinstalled).
/// Returns the number of entries removed.
pub fn remove_known_host(host: &str, port: u16) -> Result<usize, AppError> {
    let session =
        ssh2::Session::new().map_err(|e| AppError::Ssh(format!("session init failed: {e}")))?;
    let mut known_hosts = session
        .known_hosts()
        .map_err(|e| AppError::Ssh(format!("known_hosts init failed: {e}")))?;

    let path = known_hosts_path();
    if !path.exists() {
        return Ok(0);
    }
    known_hosts
        .read_file(&path, ssh2::KnownHostFileKind::OpenSSH)
        .map_err(|e| AppError::Ssh(format!("known_hosts read failed: {e}")))?;

    let entry = if port == 22 {
        host.to_string()
    } else {
        format!("[{host}]:{port}")
    };

    let matches: Vec<_> = known_hosts
        .hosts()
        .map_err(|e| AppError::Ssh(format!("known_hosts read failed: {e}")))?
        .into_iter()
        .filter(|h| h.name() == Some(entry.as_str()))
        .collect();

    for h in &matches {
        known_hosts
            .remove(h)
            .map_err(|e| AppError::Ssh(format!("known_hosts remove failed: {e}")))?;
    }

    if !matches.is_empty() {
        known_hosts
            .write_file(&path, ssh2::KnownHostFileKind::OpenSSH)
            .map_err(|e| AppError::Ssh(format!("known_hosts write failed: {e}")))?;
        invalidate_known_hosts_cache();
    }

    Ok(matches.len())
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

fn recover_lock<T>(
    result: std::sync::LockResult<std::sync::MutexGuard<'_, T>>,
) -> std::sync::MutexGuard<'_, T> {
    result.unwrap_or_else(|e| {
        eprintln!("[warn] session map mutex was poisoned; recovering state");
        e.into_inner()
    })
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
        session_id: String,
        host: String,
        port: u16,
        username: String,
        auth: AuthInfo,
        jump_chain: Vec<JumpInfo>,
        on_close: Option<OnCloseCallback>,
        app_handle: tauri::AppHandle,
        keepalive_interval: u32,
    ) -> Result<(), AppError> {
        let (tx, rx) = std::sync::mpsc::sync_channel(256);

        recover_lock(self.sessions.lock()).insert(session_id.clone(), ActiveSession { tx });

        let sessions = Arc::clone(&self.sessions);
        let sid = session_id.clone();

        std::thread::spawn(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                run_session(
                    host,
                    port,
                    username,
                    auth,
                    jump_chain,
                    on_close,
                    sid.clone(),
                    rx,
                    app_handle.clone(),
                    Arc::clone(&sessions),
                    keepalive_interval,
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
    on_close: Option<OnCloseCallback>,
    session_id: String,
    rx: std::sync::mpsc::Receiver<SessionMessage>,
    app_handle: tauri::AppHandle,
    sessions: Arc<Mutex<HashMap<String, ActiveSession>>>,
    keepalive_interval: u32,
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

        verify_host_key(&session, &host, port)?;
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

        let _ = app_handle.emit(&format!("terminal:status:{session_id}"), "connected");

        if keepalive_interval > 0 {
            session.set_keepalive(true, keepalive_interval);
        }

        session.set_blocking(false);

        let mut buf = vec![0u8; 32768];
        let mut active;
        let mut last_keepalive = std::time::Instant::now();

        'io: loop {
            active = false;

            // Drain SSH channel output, coalescing all available chunks into one emit.
            let mut coalesced: Vec<u8> = Vec::new();
            loop {
                match channel.read(&mut buf) {
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
                        active = true;
                        coalesced.extend_from_slice(&buf[..n]);
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => break,
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
                        active = true;
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
                        active = true;
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

            // When idle, sleep longer to reduce CPU wakeups (200 → 50 wakeups/s).
            // When active, just yield so other threads can run without adding latency.
            if active {
                std::thread::yield_now();
            } else {
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
                std::thread::sleep(std::time::Duration::from_millis(20));
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

    if let Some(msg) = error_msg {
        let _ = app_handle.emit(&format!("terminal:error:{session_id}"), msg);
    }

    // Payload: true = clean exit (user typed `exit`), false = unexpected drop.
    let _ = app_handle.emit(&closed_event, result.is_ok());
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh_known_hosts() -> ssh2::KnownHosts {
        ssh2::Session::new().unwrap().known_hosts().unwrap()
    }

    // Real, publicly-published ed25519 host keys (github.com / bitbucket.org) —
    // used so ssh2's known_hosts parser accepts and counts the entries.
    const HOST_KEY_1: &str =
        "first.example ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl\n";
    const HOST_KEY_2: &str =
        "second.example ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIazEu89wgQZ4bqs3d63QSMzYVa0MuJ2e2gKTKqu+UUO\n";

    /// Covers the cache's read/serve/invalidate behavior in a single test —
    /// the cache is a process-wide static, so separate tests touching it
    /// would race under cargo's parallel test runner.
    #[test]
    fn known_hosts_cache_reads_serves_and_invalidates() {
        invalidate_known_hosts_cache();
        let path =
            std::env::temp_dir().join(format!("naden_known_hosts_test_{}", uuid::Uuid::new_v4()));
        let cleanup = || {
            let _ = std::fs::remove_file(&path);
        };

        std::fs::write(&path, HOST_KEY_1).unwrap();

        // First read goes to disk and populates the cache.
        let mut first = fresh_known_hosts();
        load_known_hosts_cached(&mut first, &path);
        assert_eq!(first.hosts().unwrap().len(), 1);
        assert!(recover_lock(KNOWN_HOSTS_CACHE.lock()).is_some());

        // Overwrite with different content but restore the original mtime — a
        // cache hit (mtime unchanged) must serve the originally-read content
        // rather than re-parsing the file.
        let mtime = std::fs::metadata(&path).unwrap().modified().unwrap();
        std::fs::write(&path, format!("{HOST_KEY_1}{HOST_KEY_2}")).unwrap();
        std::fs::File::open(&path)
            .unwrap()
            .set_modified(mtime)
            .unwrap();

        let mut cached = fresh_known_hosts();
        load_known_hosts_cached(&mut cached, &path);
        assert_eq!(cached.hosts().unwrap().len(), 1);

        // After invalidation, the on-disk content (now 2 entries) is picked up.
        invalidate_known_hosts_cache();
        let mut refreshed = fresh_known_hosts();
        load_known_hosts_cached(&mut refreshed, &path);
        assert_eq!(refreshed.hosts().unwrap().len(), 2);

        cleanup();
        invalidate_known_hosts_cache();
    }
}
