use tauri::{Emitter, Manager};

mod commands;
mod db;
pub mod error;
mod models;
mod search;
mod sftp;
mod ssh;
mod vault;

pub struct AppState {
    pub db: sqlx::SqlitePool,
    /// In-memory session key — `None` when locked. `Zeroizing` scrubs bytes on drop.
    pub vault_key: tokio::sync::Mutex<Option<zeroize::Zeroizing<[u8; 32]>>>,
    /// Failed unlock attempt count and optional lockout expiry for brute-force protection.
    pub unlock_failures: tokio::sync::Mutex<(u32, Option<std::time::Instant>)>,
    /// Full server list cached in memory so fuzzy search never hits SQLite.
    /// Invalidated after every create / update / delete mutation.
    pub server_cache: tokio::sync::RwLock<Vec<models::server::ServerWithTags>>,
    /// Active built-in terminal sessions.
    pub session_manager: ssh::connection::SessionManager,
    /// Active SFTP browser sessions.
    pub sftp_manager: sftp::SftpManager,
    /// Timestamp of the last vault-related activity; used by the auto-lock task.
    pub last_vault_activity: tokio::sync::Mutex<std::time::Instant>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            // Server CRUD
            commands::server_commands::list_servers,
            commands::server_commands::get_server,
            commands::server_commands::create_server,
            commands::server_commands::update_server,
            commands::server_commands::delete_server,
            commands::server_commands::duplicate_server,
            commands::server_commands::get_recent_server_ids,
            commands::server_commands::check_reachability,
            commands::server_commands::list_groups,
            commands::server_commands::create_group,
            commands::server_commands::list_tags,
            commands::server_commands::create_tag,
            // Search
            commands::search_commands::fuzzy_search,
            // Audit
            commands::audit_commands::list_audit_log,
            commands::audit_commands::export_audit_csv,
            // Backup
            commands::backup_commands::export_backup,
            commands::backup_commands::import_backup,
            // Settings
            commands::settings_commands::get_setting,
            commands::settings_commands::set_setting,
            commands::settings_commands::vault_heartbeat,
            // SFTP
            commands::sftp_commands::open_sftp_session,
            commands::sftp_commands::close_sftp_session,
            commands::sftp_commands::list_sftp_dir,
            commands::sftp_commands::mkdir_sftp,
            commands::sftp_commands::delete_sftp,
            commands::sftp_commands::rename_sftp,
            commands::sftp_commands::upload_sftp_file,
            commands::sftp_commands::download_sftp_file,
            // SSH
            commands::ssh_commands::launch_in_terminal,
            commands::ssh_commands::import_ssh_config,
            commands::ssh_commands::confirm_ssh_config_import,
            commands::ssh_commands::open_terminal_session,
            commands::ssh_commands::close_terminal_session,
            commands::ssh_commands::send_terminal_input,
            commands::ssh_commands::resize_terminal,
            // Vault
            commands::vault_commands::vault_is_setup,
            commands::vault_commands::vault_setup,
            commands::vault_commands::vault_unlock,
            commands::vault_commands::vault_is_unlocked,
            commands::vault_commands::vault_lock,
            commands::vault_commands::vault_is_password_required,
            commands::vault_commands::vault_disable_password,
            commands::vault_commands::vault_enable_password,
            commands::vault_commands::vault_change_password,
            commands::vault_commands::store_credential,
            commands::vault_commands::retrieve_credential,
            commands::vault_commands::delete_credential,
        ])
        .setup(|app| {
            let data_dir = app.path().app_local_data_dir()?;

            let rt = tokio::runtime::Runtime::new()?;
            let pool = rt
                .block_on(db::init_db(data_dir))
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;

            let initial_cache = rt
                .block_on(db::queries::list_servers_db(&pool))
                .unwrap_or_default();

            let password_required = rt
                .block_on(vault::master_password::is_password_required(&pool))
                .unwrap_or(true);
            let initial_vault_key = if !password_required {
                Some(zeroize::Zeroizing::new([0u8; 32]))
            } else {
                None
            };

            app.manage(AppState {
                db: pool,
                vault_key: tokio::sync::Mutex::new(initial_vault_key),
                unlock_failures: tokio::sync::Mutex::new((0, None)),
                server_cache: tokio::sync::RwLock::new(initial_cache),
                session_manager: ssh::connection::SessionManager::new(),
                sftp_manager: sftp::SftpManager::new(),
                last_vault_activity: tokio::sync::Mutex::new(std::time::Instant::now()),
            });

            // Spawn vault auto-lock background task using Tauri's runtime,
            // which is already active during setup (unlike tokio::spawn).
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                auto_lock_task(handle).await;
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running SSH Manager");
}

/// Checks every 30 seconds whether the vault should be auto-locked based on
/// the `vault_timeout_minutes` setting and time since last vault activity.
async fn auto_lock_task(app: tauri::AppHandle) {
    let interval = std::time::Duration::from_secs(30);
    loop {
        tokio::time::sleep(interval).await;

        let state = app.state::<AppState>();

        // Skip if vault is already locked
        if state.vault_key.lock().await.is_none() {
            continue;
        }

        // Read timeout setting (0 = disabled)
        let timeout_mins: u64 = sqlx::query_scalar::<_, String>(
            "SELECT value FROM settings WHERE key = 'vault_timeout_minutes'",
        )
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

        if timeout_mins == 0 {
            continue;
        }

        let elapsed = state
            .last_vault_activity
            .lock()
            .await
            .elapsed();

        if elapsed >= std::time::Duration::from_secs(timeout_mins * 60) {
            *state.vault_key.lock().await = None;
            let _ = app.emit("vault_auto_locked", ());
        }
    }
}
