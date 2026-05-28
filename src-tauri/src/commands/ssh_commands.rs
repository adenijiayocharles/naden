use crate::commands::log_commands::{self, NewLogEntry};
use crate::db::queries;
use crate::error::AppError;
use crate::models::server::{CreateServerPayload, ServerWithTags};
use crate::ssh::{
    config_parser::{self, ImportPreview},
    connection::AuthInfo,
    jump_host::JumpInfo,
    launcher,
};
use crate::{vault, AppState};
use zeroize::Zeroizing;

/// Expand a leading `~` to the user's home directory using Tauri's path resolver.
fn expand_path(path: &str, app: &tauri::AppHandle) -> std::path::PathBuf {
    use tauri::Manager;
    if let Some(rest) = path.strip_prefix("~/") {
        if let Ok(home) = app.path().home_dir() {
            return home.join(rest);
        }
    }
    std::path::PathBuf::from(path)
}

/// Walk the jump_host_id chain and return hops ordered first→last.
/// Detects cycles (returns an error) and caps depth at 10.
pub(crate) async fn resolve_jump_chain(
    db: &sqlx::SqlitePool,
    server: &ServerWithTags,
) -> Result<Vec<ServerWithTags>, AppError> {
    let mut chain: Vec<ServerWithTags> = Vec::new();
    let mut next_id = server.server.jump_host_id.clone();
    let mut visited = std::collections::HashSet::new();
    visited.insert(server.server.id.clone());

    while let Some(id) = next_id {
        if !visited.insert(id.clone()) {
            return Err(AppError::Ssh(
                "circular jump-host reference detected".into(),
            ));
        }
        if chain.len() >= 10 {
            return Err(AppError::Ssh(
                "jump-host chain exceeds maximum depth of 10".into(),
            ));
        }
        let hop = queries::get_server_db(db, &id).await?;
        next_id = hop.server.jump_host_id.clone();
        chain.push(hop);
    }

    // chain is [closest_to_target, ..., farthest]; reverse for first→last order
    chain.reverse();
    Ok(chain)
}

/// Resolve the jump chain for `server` and build `JumpInfo` (with credentials) for each hop.
pub(crate) async fn build_jump_chain(
    db: &sqlx::SqlitePool,
    server: &ServerWithTags,
    state: &AppState,
    app: &tauri::AppHandle,
) -> Result<Vec<JumpInfo>, AppError> {
    let hop_servers = resolve_jump_chain(db, server).await?;
    let mut chain = Vec::with_capacity(hop_servers.len());
    for hop in &hop_servers {
        let hop_auth = auth_for_server(hop, state, app).await?;
        chain.push(JumpInfo {
            host: hop.server.hostname.clone(),
            port: u16::try_from(hop.server.port).unwrap_or(22),
            username: hop.server.username.clone(),
            auth: hop_auth,
        });
    }
    Ok(chain)
}

/// Build `AuthInfo` for `server`, reading credentials from the vault when needed.
pub(crate) async fn auth_for_server(
    server: &ServerWithTags,
    state: &AppState,
    app: &tauri::AppHandle,
) -> Result<AuthInfo, AppError> {
    let s = &server.server;
    match s.auth_method.as_str() {
        "password" => {
            let vault_id = s
                .vault_credential_id
                .as_deref()
                .ok_or_else(|| AppError::Vault("no vault credential for password auth".into()))?;
            // Hold the lock across the retrieval so the auto-lock task cannot fire
            // in the window between the is_none() check and retrieve_credential().
            let guard = state.vault_key.lock().await;
            if guard.is_none() {
                return Err(AppError::Vault("vault is locked".into()));
            }
            let password = vault::retrieve_credential(vault_id).await?;
            drop(guard);
            Ok(AuthInfo::Password(Zeroizing::new(password)))
        }
        "key" => {
            let key_path_raw = s.identity_file_path.as_deref().ok_or_else(|| {
                AppError::Ssh(
                    "No identity file configured. Edit the server and set the SSH key path.".into(),
                )
            })?;
            let key_path = expand_path(key_path_raw, app);
            let key_data = tokio::fs::read_to_string(&key_path).await.map_err(|e| {
                AppError::Ssh(format!(
                    "Cannot read key file \"{}\": {e}",
                    key_path.display()
                ))
            })?;

            // Catch common mistake: user pointed at the public key (.pub) instead of private.
            if key_data.contains(" PUBLIC KEY-----") {
                return Err(AppError::Ssh(format!(
                    "\"{}\" is a public key file. \
                     Edit the server and set the identity file to the private key \
                     (the file without the .pub extension).",
                    key_path.display()
                )));
            }
            if !key_data.contains("PRIVATE KEY") {
                return Err(AppError::Ssh(format!(
                    "\"{}\" does not look like an SSH private key. \
                     Check the identity file path in the server settings.",
                    key_path.display()
                )));
            }

            let passphrase = if let Some(vid) = &s.vault_credential_id {
                if state.vault_key.lock().await.is_some() {
                    vault::retrieve_credential(vid).await.ok()
                } else {
                    None
                }
            } else {
                None
            };
            Ok(AuthInfo::PubKey {
                key_data: Zeroizing::new(key_data),
                passphrase: passphrase.map(Zeroizing::new),
            })
        }
        _ => Err(AppError::Ssh(format!(
            "unsupported auth method: {}",
            s.auth_method
        ))),
    }
}

#[tauri::command]
pub async fn launch_in_terminal(
    server_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let server = queries::get_server_db(&state.db, &server_id).await?;
    let jump_chain = resolve_jump_chain(&state.db, &server).await?;

    let s = &server.server;
    // Insert with outcome = "success" immediately — we can't detect system terminal close
    let log_id = log_commands::insert_log_entry(
        &state.db,
        &NewLogEntry {
            server_id: Some(&server_id),
            server_display_name: &s.display_name,
            hostname: &s.hostname,
            port: s.port,
            username: &s.username,
        },
    )
    .await?;
    let db = state.db.clone();
    tauri::async_runtime::spawn(async move {
        let session_end = chrono::Utc::now().to_rfc3339();
        log_commands::close_log_entry(&db, &log_id, "success", None, &session_end)
            .await
            .ok();
    });

    launcher::launch_in_system_terminal(&server, &jump_chain).await
}

#[tauri::command]
pub async fn import_ssh_config(
    path: Option<String>,
    app: tauri::AppHandle,
    _state: tauri::State<'_, AppState>,
) -> Result<Vec<ImportPreview>, AppError> {
    use tauri::Manager;
    let config_path = match path {
        Some(p) => std::path::PathBuf::from(p),
        None => app
            .path()
            .home_dir()
            .map_err(|_| AppError::Ssh("cannot determine home directory".into()))?
            .join(".ssh")
            .join("config"),
    };
    config_parser::parse_ssh_config(&config_path, &app)
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
            vault_credential_id: None,
            group_id: None,
            is_jump_host: None,
            jump_host_id: None,
            tag_ids: None,
        };
        created.push(queries::create_server_db(&state.db, &payload).await?);
    }

    // Flush the in-memory cache so list_servers returns the newly imported entries.
    if let Ok(fresh) = queries::list_servers_db(&state.db).await {
        *state.server_cache.write().await = fresh;
    }

    Ok(created)
}

/// Opens a built-in terminal session. The caller supplies `session_id` so it can
/// register event listeners before this returns and the thread starts.
#[tauri::command]
pub async fn open_terminal_session(
    server_id: String,
    session_id: String,
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), AppError> {
    let server = queries::get_server_db(&state.db, &server_id).await?;
    let auth = auth_for_server(&server, &state, &app_handle).await?;

    let jump_chain = build_jump_chain(&state.db, &server, &state, &app_handle).await?;

    let s = &server.server;

    // Insert log entry and pass a close callback so the session thread can
    // update the outcome and duration when the session ends.
    let log_id = log_commands::insert_log_entry(
        &state.db,
        &NewLogEntry {
            server_id: Some(&server_id),
            server_display_name: &s.display_name,
            hostname: &s.hostname,
            port: s.port,
            username: &s.username,
        },
    )
    .await?;
    let db = state.db.clone();
    let on_close = Box::new(move |outcome: String, error_msg: Option<String>| {
        let session_end = chrono::Utc::now().to_rfc3339();
        // run_session runs on a std::thread with no async runtime. Dispatch the
        // DB write onto Tauri's existing runtime rather than constructing a new one.
        tauri::async_runtime::spawn(async move {
            log_commands::close_log_entry(&db, &log_id, &outcome, error_msg, &session_end)
                .await
                .ok();
        });
    });

    state.session_manager.open_session(
        session_id,
        s.hostname.clone(),
        u16::try_from(s.port).unwrap_or(22),
        s.username.clone(),
        auth,
        jump_chain,
        Some(on_close),
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
    state
        .session_manager
        .send_input(&session_id, data.into_bytes())
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
