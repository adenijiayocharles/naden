use std::collections::HashSet;
use std::net::{Ipv4Addr, SocketAddr};
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use ssh2_config::{HostParams, ParseRule, SshConfig};
use tauri::{Emitter, Manager};
use tokio::net::TcpStream;
use tokio::sync::Semaphore;

use crate::error::AppError;
use crate::ssh::connection::known_hosts_path;

const SCAN_PORT: i64 = 22;
const CONNECT_TIMEOUT: Duration = Duration::from_millis(300);
const MAX_CONCURRENCY: usize = 64;
const MAX_SCAN_HOSTS: usize = 1024;
const PROGRESS_THROTTLE: Duration = Duration::from_millis(100);

/// Default SSH private key filenames, in the order ssh itself tries them.
const DEFAULT_KEY_NAMES: &[&str] = &["id_ed25519", "id_ecdsa", "id_rsa", "id_dsa"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredHost {
    pub ip: String,
    pub hostname: Option<String>,
    pub port: i64,
    pub source: String,
    pub identity_file_path: Option<String>,
    pub username: Option<String>,
    /// `true`/`false` once the identity file has been checked, `None` if there's no key to check.
    pub needs_passphrase: Option<bool>,
}

/// Returns the usable host addresses for an interface's network/netmask,
/// excluding the network and broadcast addresses, capped at `MAX_SCAN_HOSTS`.
pub fn hosts_in_cidr(ip: Ipv4Addr, netmask: Ipv4Addr) -> Vec<Ipv4Addr> {
    let ip = u32::from(ip);
    let mask = u32::from(netmask);
    let network = ip & mask;
    let broadcast = network | !mask;

    // /31 and /32 have no usable host range (no distinct network/broadcast pair).
    if broadcast <= network + 1 {
        return Vec::new();
    }

    ((network + 1)..broadcast)
        .take(MAX_SCAN_HOSTS)
        .map(Ipv4Addr::from)
        .collect()
}

pub async fn scan_lan(app: &tauri::AppHandle) -> Result<Vec<DiscoveredHost>, AppError> {
    let interfaces = if_addrs::get_if_addrs()
        .map_err(|e| AppError::Io(format!("failed to list network interfaces: {e}")))?;

    let mut candidates: Vec<Ipv4Addr> = Vec::new();
    for iface in interfaces {
        if iface.is_loopback() {
            continue;
        }
        if let if_addrs::IfAddr::V4(v4) = iface.addr {
            for host in hosts_in_cidr(v4.ip, v4.netmask) {
                if host != v4.ip {
                    candidates.push(host);
                }
            }
        }
    }
    candidates.sort_unstable();
    candidates.dedup();

    let total = candidates.len() as u32;
    let scanned = Arc::new(AtomicU32::new(0));
    let last_emit = Arc::new(Mutex::new(Instant::now()));
    let semaphore = Arc::new(Semaphore::new(MAX_CONCURRENCY));

    let mut tasks = Vec::with_capacity(candidates.len());
    for ip in candidates {
        let semaphore = semaphore.clone();
        let scanned = scanned.clone();
        let last_emit = last_emit.clone();
        let app = app.clone();
        tasks.push(tokio::spawn(async move {
            let _permit = semaphore.acquire().await;
            let addr = SocketAddr::from((ip, SCAN_PORT as u16));
            let is_open = tokio::time::timeout(CONNECT_TIMEOUT, TcpStream::connect(addr))
                .await
                .is_ok_and(|r| r.is_ok());

            let done = scanned.fetch_add(1, Ordering::Relaxed) + 1;
            let now = Instant::now();
            let mut last = last_emit.lock().expect("last_emit mutex poisoned");
            if done == total || now.duration_since(*last) >= PROGRESS_THROTTLE {
                *last = now;
                let _ = app.emit(
                    "discovery:scan_progress",
                    serde_json::json!({ "scanned": done, "total": total }),
                );
            }
            drop(last);

            is_open.then_some(ip)
        }));
    }

    let mut found = Vec::new();
    for task in tasks {
        if let Some(ip) = task.await.map_err(|e| AppError::Io(e.to_string()))? {
            found.push(DiscoveredHost {
                ip: ip.to_string(),
                hostname: None,
                port: SCAN_PORT,
                source: "lan".to_string(),
                identity_file_path: None,
                username: None,
                needs_passphrase: None,
            });
        }
    }

    // Always emit a final event so the frontend progress reaches 100%, even
    // when there are no candidates to scan.
    let _ = app.emit(
        "discovery:scan_progress",
        serde_json::json!({ "scanned": total, "total": total }),
    );

    Ok(found)
}

/// Parses `~/.ssh/known_hosts` for previously-trusted hosts.
pub fn parse_known_hosts(path: &Path) -> Result<Vec<DiscoveredHost>, AppError> {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(AppError::Io(e.to_string())),
    };

    let mut seen = HashSet::new();
    let mut hosts = Vec::new();

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some(patterns) = line.split_whitespace().next() else {
            continue;
        };

        for pattern in patterns.split(',') {
            // Hashed entries ("|1|...") can't be reversed, and wildcards
            // don't represent a single addressable host.
            if pattern.starts_with("|1|") || pattern.contains('*') || pattern.contains('?') {
                continue;
            }

            let (host, port) = match pattern.strip_prefix('[') {
                Some(rest) => match rest.split_once("]:") {
                    Some((host, port_str)) => match port_str.parse::<i64>() {
                        Ok(port) => (host.to_string(), port),
                        Err(_) => continue,
                    },
                    None => continue,
                },
                None => (pattern.to_string(), SCAN_PORT),
            };

            if seen.insert((host.clone(), port)) {
                hosts.push(DiscoveredHost {
                    ip: host,
                    hostname: None,
                    port,
                    source: "knownHosts".to_string(),
                    identity_file_path: None,
                    username: None,
                    needs_passphrase: None,
                });
            }
        }
    }

    Ok(hosts)
}

pub fn parse_default_known_hosts() -> Result<Vec<DiscoveredHost>, AppError> {
    parse_known_hosts(&known_hosts_path())
}

/// Returns the path to the first default SSH private key found in `ssh_dir`, if any.
fn default_identity_file_path(ssh_dir: &Path) -> Option<String> {
    DEFAULT_KEY_NAMES
        .iter()
        .map(|name| ssh_dir.join(name))
        .find(|p| p.is_file())
        .map(|p| p.to_string_lossy().to_string())
}

/// Returns the `IdentityFile` configured for a host, if any. `ssh2_config`
/// resolves `~` against the real home directory while parsing, so the
/// returned path is already absolute.
fn identity_file_from_params(params: &HostParams) -> Option<String> {
    params
        .identity_file
        .as_ref()
        .and_then(|files| files.first())
        .map(|p| p.to_string_lossy().to_string())
}

/// Resolves an SSH identity file for each host, preferring a per-host match
/// in `~/.ssh/config` and falling back to the user's default key (if any).
pub fn resolve_identity_files(hosts: &mut [DiscoveredHost], app: &tauri::AppHandle) {
    let home_dir = app.path().home_dir().ok();

    let config = home_dir.as_ref().and_then(|home| {
        let file = std::fs::File::open(home.join(".ssh").join("config")).ok()?;
        let mut reader = std::io::BufReader::new(file);
        SshConfig::default()
            .parse(&mut reader, ParseRule::ALLOW_UNKNOWN_FIELDS)
            .ok()
    });

    let default_key = home_dir
        .as_ref()
        .and_then(|home| default_identity_file_path(&home.join(".ssh")));

    for host in hosts.iter_mut() {
        let params = config.as_ref().map(|c| c.query(&host.ip));

        host.username = params.as_ref().and_then(|p| p.user.clone());

        host.identity_file_path = params
            .as_ref()
            .and_then(identity_file_from_params)
            .or_else(|| default_key.clone());

        host.needs_passphrase = host
            .identity_file_path
            .as_ref()
            .and_then(|path| std::fs::read_to_string(path).ok())
            .map(|pem| crate::ssh::connection::key_is_encrypted(&pem));
    }
}

#[cfg(test)]
mod tests;
