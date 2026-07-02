use crate::commands::ssh_commands::{auth_for_server, build_jump_chain};
use crate::db::queries;
use crate::error::AppError;
use crate::models::port_forward::{
    CreatePortForwardPayload, PortForward, UpdatePortForwardPayload,
};
use crate::AppState;

#[tauri::command]
pub async fn list_port_forwards(
    server_id: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<PortForward>, AppError> {
    queries::list_port_forwards_db(&state.db, server_id.as_deref()).await
}

#[tauri::command]
pub async fn create_port_forward(
    payload: CreatePortForwardPayload,
    state: tauri::State<'_, AppState>,
) -> Result<PortForward, AppError> {
    queries::create_port_forward_db(&state.db, &payload).await
}

#[tauri::command]
pub async fn update_port_forward(
    id: String,
    payload: UpdatePortForwardPayload,
    state: tauri::State<'_, AppState>,
) -> Result<PortForward, AppError> {
    queries::update_port_forward_db(&state.db, &id, &payload).await
}

#[tauri::command]
pub async fn delete_port_forward(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    queries::delete_port_forward_db(&state.db, &id).await
}

// ── Activation commands ───────────────────────────────────────────────────────

/// Starts a port forward tunnel. Resolves server credentials and jump chain,
/// then hands off to the TunnelManager which runs the worker in a background thread.
#[tauri::command]
pub async fn start_tunnel(
    forward_id: String,
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), AppError> {
    let fwd = queries::get_port_forward_db(&state.db, &forward_id).await?;

    let server = queries::get_server_db(&state.db, &fwd.server_id).await?;
    let auth = auth_for_server(&server, &state, &app_handle).await?;
    let jump_chain = build_jump_chain(&server, &state, &app_handle).await?;

    let s = &server.server;
    state.tunnel_manager.start(
        fwd,
        crate::tunnel::TunnelTarget {
            host: s.hostname.clone(),
            port: u16::try_from(s.port).unwrap_or(22),
            username: s.username.clone(),
            auth,
            jump_chain,
        },
        app_handle,
        std::sync::Arc::clone(&state.session_manager.host_key_confirmations),
    )
}

/// Signals a running tunnel to shut down.
#[tauri::command]
pub async fn stop_tunnel(
    forward_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    state.tunnel_manager.stop(&forward_id)
}

/// Returns the IDs of all currently active tunnels.
#[tauri::command]
pub async fn list_active_tunnel_ids(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, AppError> {
    Ok(state.tunnel_manager.active_ids())
}
