use tauri::Manager;

mod commands;
mod db;
pub mod error;
mod models;
mod search;
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
            commands::server_commands::list_groups,
            commands::server_commands::create_group,
            commands::server_commands::list_tags,
            commands::server_commands::create_tag,
            // Search
            commands::search_commands::fuzzy_search,
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

            // Auto-unlock when the user has opted out of password protection.
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
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running SSH Manager");
}
