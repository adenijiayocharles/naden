use std::io::Read;

use crate::commands::ssh_commands::{auth_for_server, build_jump_chain, get_server_cached};
use crate::error::AppError;
use crate::ssh::connection::{authenticate_session, tcp_connect, verify_host_key};
use crate::ssh::jump_host;
use crate::AppState;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerHealth {
    pub server_id: String,
    pub cpu_percent: Option<f64>,
    pub mem_percent: Option<f64>,
    pub disk_percent: Option<f64>,
    pub timestamp: i64,
}

#[tauri::command]
pub async fn fetch_server_health(
    server_id: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<ServerHealth, AppError> {
    let server = get_server_cached(&state, &server_id).await?;
    let auth = auth_for_server(&server, &state, &app).await?;
    let jump_chain = build_jump_chain(&server, &state, &app).await?;

    let host = server.server.hostname.clone();
    let port = u16::try_from(server.server.port).map_err(|_| {
        AppError::Validation(format!("port {} is out of valid range", server.server.port))
    })?;
    let username = server.server.username.clone();

    tauri::async_runtime::spawn_blocking(move || {
        run_health_check(server_id, host, port, username, auth, jump_chain)
    })
    .await
    .map_err(|e| AppError::Ssh(format!("health check panicked: {e}")))?
}

fn run_health_check(
    server_id: String,
    host: String,
    port: u16,
    username: String,
    auth: crate::ssh::connection::AuthInfo,
    jump_chain: Vec<crate::ssh::jump_host::JumpInfo>,
) -> Result<ServerHealth, AppError> {
    let stream = if jump_chain.is_empty() {
        tcp_connect(&host, port)?
    } else {
        jump_host::open_tunnel(jump_chain, &host, port)?
    };

    let mut session =
        ssh2::Session::new().map_err(|e| AppError::Ssh(format!("session create failed: {e}")))?;
    session.set_tcp_stream(stream);
    // Set timeout before the handshake so a stalled server cannot block indefinitely.
    session.set_timeout(5_000);
    session
        .handshake()
        .map_err(|e| AppError::Ssh(format!("handshake failed: {e}")))?;
    verify_host_key(&session, &host, port)?;
    authenticate_session(&mut session, &username, &auth)?;

    let cpu_percent = fetch_cpu(&session);
    let mem_percent = fetch_mem(&session);
    let disk_percent = fetch_disk(&session);

    Ok(ServerHealth {
        server_id,
        cpu_percent,
        mem_percent,
        disk_percent,
        timestamp: chrono::Utc::now().timestamp(),
    })
}

fn exec_command(session: &ssh2::Session, cmd: &str) -> Result<String, AppError> {
    let mut ch = session
        .channel_session()
        .map_err(|e| AppError::Ssh(format!("channel open failed: {e}")))?;
    ch.exec(cmd)
        .map_err(|e| AppError::Ssh(format!("exec failed: {e}")))?;
    let mut out = String::new();
    ch.read_to_string(&mut out)
        .map_err(|e| AppError::Ssh(format!("read failed: {e}")))?;
    let _ = ch.wait_close();
    Ok(out)
}

/// Two-sample CPU% via /proc/stat delta over 200 ms — gives a meaningful
/// current utilisation rather than a since-boot cumulative average.
fn fetch_cpu(session: &ssh2::Session) -> Option<f64> {
    fn parse_stat(raw: &str) -> Option<(u64, u64)> {
        let line = raw.lines().find(|l| l.starts_with("cpu "))?;
        let vals: Vec<u64> = line
            .split_whitespace()
            .skip(1)
            .filter_map(|s| s.parse().ok())
            .collect();
        if vals.len() < 4 {
            return None;
        }
        // idle = idle + iowait (indices 3 and 4)
        let idle = vals[3] + vals.get(4).copied().unwrap_or(0);
        let total: u64 = vals.iter().sum();
        Some((idle, total))
    }

    // Single round-trip: remote shell does the 200 ms wait, avoiding a
    // blocking thread::sleep inside spawn_blocking and saving one SSH round-trip.
    let combined = exec_command(
        session,
        "cat /proc/stat; echo '---NADEN_SEP---'; sleep 0.2; cat /proc/stat",
    )
    .ok()?;
    let sep = combined.find("---NADEN_SEP---\n")?;
    let raw1 = &combined[..sep];
    let raw2 = &combined[sep + "---NADEN_SEP---\n".len()..];

    let (idle1, total1) = parse_stat(raw1)?;
    let (idle2, total2) = parse_stat(raw2)?;

    let d_total = total2.saturating_sub(total1);
    let d_idle = idle2.saturating_sub(idle1);

    if d_total == 0 {
        return Some(0.0);
    }
    Some(((d_total - d_idle) as f64 / d_total as f64 * 100.0).round())
}

fn fetch_mem(session: &ssh2::Session) -> Option<f64> {
    let meminfo = exec_command(session, "cat /proc/meminfo").ok()?;
    let mut total_kb = 0u64;
    let mut available_kb = 0u64;
    for line in meminfo.lines() {
        if line.starts_with("MemTotal:") {
            total_kb = line.split_whitespace().nth(1)?.parse().ok()?;
        } else if line.starts_with("MemAvailable:") {
            available_kb = line.split_whitespace().nth(1)?.parse().ok()?;
        }
    }
    if total_kb == 0 {
        return None;
    }
    let used = total_kb.saturating_sub(available_kb);
    Some((used as f64 / total_kb as f64 * 100.0).round())
}

fn fetch_disk(session: &ssh2::Session) -> Option<f64> {
    let df = exec_command(session, "df /").ok()?;
    // df output: Filesystem  1K-blocks  Used  Available  Use%  Mounted on
    // The data row can wrap if the filesystem name is long — scan all non-header
    // lines for a token ending with '%'.
    for line in df.lines().skip(1) {
        for token in line.split_whitespace() {
            if let Some(pct_str) = token.strip_suffix('%') {
                if let Ok(pct) = pct_str.parse::<f64>() {
                    return Some(pct);
                }
            }
        }
    }
    None
}
