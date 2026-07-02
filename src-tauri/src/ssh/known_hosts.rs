use base64::Engine as _;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::Emitter;

use super::connection::recover_lock;
use crate::error::AppError;

/// Tracks pending "do you trust this host?" prompts for interactive terminal
/// sessions. Maps `session_id` to a one-shot channel the frontend writes
/// `true`/`false` into via `confirm_host_key`.
pub type HostKeyConfirmations = Arc<Mutex<HashMap<String, std::sync::mpsc::SyncSender<bool>>>>;

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

/// Payload emitted when a new host key is seen for the first time.
#[derive(serde::Serialize, Clone)]
pub struct HostKeyPromptPayload {
    pub session_id: String,
    pub host: String,
    pub port: u16,
    pub fingerprint: String,
    pub key_type: String,
}

/// Like `verify_host_key` but on first contact (key `NotFound`) emits a Tauri
/// event and waits for the user to accept or reject via `confirm_host_key`.
/// Only used for interactive terminal sessions; SFTP/tunnel/health use the
/// silent TOFU path via the regular `verify_host_key`.
pub(crate) fn verify_host_key_interactive(
    session: &ssh2::Session,
    host: &str,
    port: u16,
    session_id: &str,
    app_handle: &tauri::AppHandle,
    confirmations: &HostKeyConfirmations,
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
            let fingerprint = session
                .host_key_hash(ssh2::HashType::Sha256)
                .map(|h| {
                    format!(
                        "SHA256:{}",
                        base64::engine::general_purpose::STANDARD.encode(h)
                    )
                })
                .unwrap_or_else(|| "<unknown>".to_string());
            let key_type_str = format!("{key_type:?}");

            let (tx, rx) = std::sync::mpsc::sync_channel::<bool>(1);
            recover_lock(confirmations.lock()).insert(session_id.to_string(), tx);

            let _ = app_handle.emit(
                "ssh:host-key-prompt",
                HostKeyPromptPayload {
                    session_id: session_id.to_string(),
                    host: host.to_string(),
                    port,
                    fingerprint,
                    key_type: key_type_str,
                },
            );

            let accepted = rx
                .recv_timeout(std::time::Duration::from_secs(60))
                .unwrap_or(false);

            recover_lock(confirmations.lock()).remove(session_id);

            if !accepted {
                return Err(AppError::Ssh(format!(
                    "Connection to {host}:{port} rejected: host key not trusted"
                )));
            }

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

#[cfg(test)]
#[path = "known_hosts_tests.rs"]
mod tests;
