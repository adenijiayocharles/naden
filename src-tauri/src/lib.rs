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
    /// In-memory session key — `None` when the vault is locked.
    pub vault_key: tokio::sync::Mutex<Option<[u8; 32]>>,
    /// Full server list cached in memory so fuzzy search never hits SQLite.
    /// Invalidated after every create / update / delete mutation.
    pub server_cache: tokio::sync::RwLock<Vec<models::server::ServerWithTags>>,
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
            // Vault
            commands::vault_commands::vault_is_setup,
            commands::vault_commands::vault_setup,
            commands::vault_commands::vault_unlock,
            commands::vault_commands::vault_is_unlocked,
            commands::vault_commands::vault_lock,
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

            app.manage(AppState {
                db: pool,
                vault_key: tokio::sync::Mutex::new(None),
                server_cache: tokio::sync::RwLock::new(initial_cache),
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running SSH Manager");
}
