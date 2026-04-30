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
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|app| {
            let data_dir = app.path().app_local_data_dir()?;

            // Initialize the DB synchronously before the event loop starts so
            // every command handler can safely assume State<AppState> is present.
            let rt = tokio::runtime::Runtime::new()?;
            let pool = rt
                .block_on(db::init_db(data_dir))
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;

            app.manage(AppState { db: pool });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running SSH Manager");
}
