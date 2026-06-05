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
            let key: [u8; 32] = {
                let guard = state.vault_key.lock().await;
                match guard.as_ref() {
                    None => return Err(AppError::Vault("vault is locked".into())),
                    Some(k) => **k,
                }
            };
            let password = vault::retrieve_credential(&state.db, &key, vault_id).await?;
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
                // Log the full path for diagnostics; omit it from the user-facing message
                // to avoid exposing filesystem layout through the IPC surface.
                log::error!("cannot read key file \"{}\": {e}", key_path.display());
                AppError::Ssh(format!(
                    "Cannot read the identity file ({e}). Check the path in server settings."
                ))
            })?;

            // Catch common mistake: user pointed at the public key (.pub) instead of private.
            if key_data.contains(" PUBLIC KEY-----") {
                return Err(AppError::Ssh(
                    "The identity file is a public key, not a private key. \
                     Edit the server and set the path to the private key \
                     (the file without the .pub extension)."
                        .into(),
                ));
            }
            if !key_data.contains("PRIVATE KEY") {
                return Err(AppError::Ssh(
                    "The identity file does not look like an SSH private key. \
                     Check the identity file path in the server settings."
                        .into(),
                ));
            }

            let passphrase = if let Some(vid) = &s.vault_credential_id {
                let key_opt: Option<[u8; 32]> = {
                    let guard = state.vault_key.lock().await;
                    guard.as_ref().map(|k| **k)
                };
                if let Some(key) = key_opt {
                    vault::retrieve_credential(&state.db, &key, vid).await.ok()
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
        Some(p) => {
            // Caller-supplied paths must stay within the home directory to
            // prevent the frontend from reading arbitrary filesystem paths.
            crate::commands::local_commands::check_home_boundary(&p)
                .map_err(|_| AppError::Ssh("SSH config path must be within home directory".into()))?
        }
        None => app
            .path()
            .home_dir()
            .map_err(|_| AppError::Ssh("cannot determine home directory".into()))?
            .join(".ssh")
            .join("config"),
    };
    config_parser::parse_ssh_config(&config_path, &app)
}

/// Validate hostname: reject empty strings and control characters that could
/// indicate a crafted IPC payload. Parameterized queries protect the DB, but
/// we still refuse obviously invalid values before they get stored.
fn validate_import_hostname(hostname: &str) -> Result<(), AppError> {
    if hostname.is_empty() {
        return Err(AppError::Validation("hostname must not be empty".into()));
    }
    if hostname.bytes().any(|b| b < 0x20 || b == 0x7f) {
        return Err(AppError::Validation(
            "hostname contains invalid characters".into(),
        ));
    }
    Ok(())
}

/// Validate that an identity file path stays within the user's home directory.
/// Uses logical path normalization so the file does not need to exist yet.
fn validate_import_identity_path(path: &str, app: &tauri::AppHandle) -> Result<(), AppError> {
    let expanded = expand_path(path, app);
    let home = crate::commands::local_commands::home_boundary();
    // Normalize without hitting the filesystem so missing-key imports still pass.
    let mut clean = std::path::PathBuf::new();
    for component in expanded.components() {
        match component {
            std::path::Component::ParentDir => {
                clean.pop();
            }
            c => clean.push(c),
        }
    }
    if !clean.starts_with(&home) {
        return Err(AppError::Validation(
            "identity file path must be within home directory".into(),
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn confirm_ssh_config_import(
    previews: Vec<ImportPreview>,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Vec<ServerWithTags>, AppError> {
    // Validate all entries before inserting any.
    for preview in &previews {
        let hostname = preview
            .hostname
            .as_deref()
            .unwrap_or(&preview.pattern);
        validate_import_hostname(hostname)?;
        if let Some(ref key_path) = preview.identity_file_path {
            validate_import_identity_path(key_path, &app)?;
        }
    }

    // Pass 1: insert every host; build a pattern → server-id map for jump wiring.
    let mut pattern_to_id: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    let mut created = Vec::with_capacity(previews.len());

    for preview in &previews {
        let hostname = preview
            .hostname
            .clone()
            .unwrap_or_else(|| preview.pattern.clone());

        let payload = CreateServerPayload {
            display_name: preview.pattern.clone(),
            hostname,
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
        let server = queries::create_server_db(&state.db, &payload).await?;
        pattern_to_id.insert(preview.pattern.clone(), server.server.id.clone());
        created.push(server);
    }

    // Pass 2: wire ProxyJump relationships.
    for preview in &previews {
        let Some(ref jump_pattern) = preview.proxy_jump else {
            continue;
        };
        let Some(jump_id) = pattern_to_id.get(jump_pattern) else {
            // Jump target wasn't in this import batch — skip silently.
            continue;
        };
        let dependent_id = pattern_to_id[&preview.pattern].clone();

        // Mark the jump host as a jump host — targeted update so other fields
        // (identity_file_path, auth_method, etc.) set during import are not wiped.
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "UPDATE servers SET is_jump_host = 1, updated_at = ? WHERE id = ?",
        )
        .bind(&now)
        .bind(jump_id)
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        // Link the dependent server to its jump host.
        sqlx::query(
            "UPDATE servers SET jump_host_id = ?, updated_at = ? WHERE id = ?",
        )
        .bind(jump_id)
        .bind(&now)
        .bind(&dependent_id)
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    }

    // Flush the in-memory cache so list_servers returns the newly imported entries.
    if let Ok(fresh) = queries::list_servers_db(&state.db).await {
        // Rebuild `created` from the refreshed list so callers see updated jump fields.
        let ids: std::collections::HashSet<&str> = pattern_to_id.values().map(String::as_str).collect();
        created = fresh
            .iter()
            .filter(|s| ids.contains(s.server.id.as_str()))
            .cloned()
            .collect();
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

    let keepalive_interval: u32 = sqlx::query_scalar::<_, String>(
        "SELECT value FROM settings WHERE key = 'ssh_keepalive_interval'",
    )
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten()
    .and_then(|v| v.parse().ok())
    .unwrap_or(0);

    state.session_manager.open_session(
        session_id,
        s.hostname.clone(),
        u16::try_from(s.port).unwrap_or(22),
        s.username.clone(),
        auth,
        jump_chain,
        Some(on_close),
        app_handle.clone(),
        keepalive_interval,
    )?;

    // Auto-start any port forwards configured for this server.
    let auto_fwds: Vec<_> = queries::list_port_forwards_db(&state.db, Some(&server_id))
        .await
        .unwrap_or_default()
        .into_iter()
        .filter(|f| f.auto_start && !state.tunnel_manager.is_active(&f.id))
        .collect();

    for fwd in auto_fwds {
        let fwd_auth = match auth_for_server(&server, &state, &app_handle).await {
            Ok(a) => a,
            Err(e) => {
                log::warn!(
                    "[auto-start] could not get auth for tunnel {}: {e}",
                    fwd.id
                );
                continue;
            }
        };
        let fwd_jumps = build_jump_chain(&state.db, &server, &state, &app_handle)
            .await
            .unwrap_or_default();
        let _ = state.tunnel_manager.start(
            fwd,
            crate::tunnel::TunnelTarget {
                host: s.hostname.clone(),
                port: u16::try_from(s.port).unwrap_or(22),
                username: s.username.clone(),
                auth: fwd_auth,
                jump_chain: fwd_jumps,
            },
            app_handle.clone(),
        );
    }

    Ok(())
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
