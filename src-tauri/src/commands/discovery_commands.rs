use crate::discovery::{self, DiscoveredHost};
use crate::error::AppError;
use crate::AppState;

/// Filters out hosts that match an existing server's hostname.
async fn drop_known_servers(
    hosts: Vec<DiscoveredHost>,
    state: &tauri::State<'_, AppState>,
) -> Vec<DiscoveredHost> {
    let cache = state.server_cache.read().await;
    hosts
        .into_iter()
        .filter(|host| !cache.iter().any(|s| s.server.hostname == host.ip))
        .collect()
}

#[tauri::command]
pub async fn scan_lan_hosts(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DiscoveredHost>, AppError> {
    let hosts = discovery::scan_lan(&app).await?;
    let mut hosts = drop_known_servers(hosts, &state).await;
    discovery::resolve_identity_files(&mut hosts, &app);
    Ok(hosts)
}

#[tauri::command]
pub async fn import_known_hosts(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DiscoveredHost>, AppError> {
    let hosts = discovery::parse_default_known_hosts()?;
    let mut hosts = drop_known_servers(hosts, &state).await;
    discovery::resolve_identity_files(&mut hosts, &app);
    Ok(hosts)
}
