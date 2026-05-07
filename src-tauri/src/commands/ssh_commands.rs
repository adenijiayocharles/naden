use crate::db::queries;
use crate::error::AppError;
use crate::models::server::{CreateServerPayload, ServerWithTags};
use crate::ssh::{
    config_parser::{self, ImportPreview},
    connection,
    launcher,
};
use crate::{vault, AppState};

/// Expand a leading `~` to the user's home directory.
/// Paths from the file picker are already absolute; this handles manually typed paths.
fn expand_path(path: &str) -> std::path::PathBuf {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    std::path::PathBuf::from(path)
}

#[tauri::command]
pub async fn launch_in_terminal(
    server_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let server = queries::get_server_db(&state.db, &server_id).await?;
    launcher::launch_in_system_terminal(&server).await
}

#[tauri::command]
pub async fn import_ssh_config(
    path: Option<String>,
    _state: tauri::State<'_, AppState>,
) -> Result<Vec<ImportPreview>, AppError> {
    let config_path = match path {
        Some(p) => std::path::PathBuf::from(p),
        None => dirs::home_dir()
            .ok_or_else(|| AppError::Ssh("cannot determine home directory".into()))?
            .join(".ssh")
            .join("config"),
    };

    config_parser::parse_ssh_config(&config_path)
}

#[tauri::command]
pub async fn confirm_ssh_config_import(
    previews: Vec<ImportPreview>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ServerWithTags>, AppError> {
    let mut created = Vec::with_capacity(previews.len());

    for preview in &previews {
        let payload = CreateServerPayload {
            display_name: preview.pattern.clone(),
            hostname: preview
                .hostname
                .clone()
                .unwrap_or_else(|| preview.pattern.clone()),
            port: preview.port,
            username: preview.username.clone(),
            auth_method: preview
                .identity_file_path
                .is_some()
                .then(|| "key".to_string()),
            identity_file_path: preview.identity_file_path.clone(),
            group_id: None,
            notes: None,
            is_jump_host: None,
            jump_host_id: None,
            tag_ids: None,
        };

        created.push(queries::create_server_db(&state.db, &payload).await?);
    }

    Ok(created)
}

/// Opens a built-in terminal session. Returns a session_id used for all subsequent
/// events and commands. The actual SSH connection happens asynchronously in a
/// background thread; status arrives via `terminal:status:{id}` events.
#[tauri::command]
pub async fn open_terminal_session(
    server_id: String,
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<String, AppError> {
    let server = queries::get_server_db(&state.db, &server_id).await?;
    let s = &server.server;

    let auth = match s.auth_method.as_str() {
        "password" => {
            let vault_id = s
                .vault_credential_id
                .as_deref()
                .ok_or_else(|| AppError::Vault("no vault credential for password auth".into()))?;
            if state.vault_key.lock().await.is_none() {
                return Err(AppError::Vault("vault is locked".into()));
            }
            let password = vault::retrieve_credential(vault_id).await?;
            connection::AuthInfo::Password(password)
        }
        "key" => {
            let key_path_raw = s
                .identity_file_path
                .as_deref()
                .ok_or_else(|| AppError::Ssh("no identity file path for key auth".into()))?;
            let key_path = expand_path(key_path_raw);
            let key_data = tokio::fs::read_to_string(&key_path)
                .await
                .map_err(|e| AppError::Ssh(format!("failed to read key file {}: {e}", key_path.display())))?;
            // Passphrase is optional — only retrieved if there's a vault_credential_id
            let passphrase = if let Some(vid) = &s.vault_credential_id {
                if state.vault_key.lock().await.is_some() {
                    vault::retrieve_credential(vid).await.ok()
                } else {
                    None
                }
            } else {
                None
            };
            connection::AuthInfo::PubKey { key_data, passphrase }
        }
        _ => connection::AuthInfo::Agent,
    };

    state.session_manager.open_session(
        s.hostname.clone(),
        s.port as u16,
        s.username.clone(),
        auth,
        server.server.display_name.clone(),
        app_handle,
    )
}

#[tauri::command]
pub async fn close_terminal_session(
    session_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    state.session_manager.close_session(&session_id);
    Ok(())
}

#[tauri::command]
pub async fn send_terminal_input(
    session_id: String,
    data: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    state.session_manager.send_input(&session_id, data.into_bytes())
}

#[tauri::command]
pub async fn resize_terminal(
    session_id: String,
    cols: u16,
    rows: u16,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    state.session_manager.resize(&session_id, cols, rows)
}
