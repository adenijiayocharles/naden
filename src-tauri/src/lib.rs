use tauri::{Emitter, Manager};

mod assistant;
mod commands;
mod db;
mod discovery;
pub mod error;
mod models;
mod platform;
mod power;
mod search;
mod sftp;
mod ssh;
mod tray;
mod tunnel;
mod vault;

pub struct AppState {
    pub db: sqlx::SqlitePool,
    /// In-memory session key — `None` when locked. `Zeroizing` scrubs bytes on drop.
    pub vault_key: tokio::sync::Mutex<Option<zeroize::Zeroizing<[u8; 32]>>>,
    /// Failed unlock attempt count and optional lockout expiry for brute-force protection.
    pub unlock_failures: tokio::sync::Mutex<(u32, Option<std::time::SystemTime>)>,
    /// Full server list cached in memory so fuzzy search never hits SQLite.
    /// Invalidated after every create / update / delete mutation.
    pub server_cache: tokio::sync::RwLock<Vec<models::server::ServerWithTags>>,
    /// Active built-in terminal sessions.
    pub session_manager: ssh::connection::SessionManager,
    /// Active SFTP browser sessions.
    pub sftp_manager: sftp::SftpManager,
    /// Active port-forward tunnels.
    pub tunnel_manager: tunnel::TunnelManager,
    /// Timestamp of the last vault-related activity; used by the auto-lock task.
    pub last_vault_activity: tokio::sync::Mutex<std::time::Instant>,
    /// Set to true when the user explicitly calls vault_lock so the heartbeat
    /// does not auto-restore the key when password protection is disabled.
    pub manually_locked: tokio::sync::Mutex<bool>,
}

#[tauri::command]
fn update_tray_menu(app: tauri::AppHandle, servers: Vec<tray::TrayServer>) -> Result<(), String> {
    tray::rebuild(&app, &servers).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            // Server CRUD
            commands::server_commands::list_servers,
            commands::server_commands::get_server,
            commands::server_commands::create_server,
            commands::server_commands::update_server,
            commands::server_commands::delete_server,
            commands::server_commands::move_server_group,
            commands::server_commands::toggle_favourite,
            commands::server_commands::duplicate_server,
            commands::server_commands::get_recent_server_ids,
            commands::server_commands::check_reachability,
            commands::server_commands::list_groups,
            commands::server_commands::create_group,
            commands::server_commands::update_group,
            commands::server_commands::delete_group,
            commands::server_commands::list_tags,
            commands::server_commands::create_tag,
            commands::server_commands::update_tag,
            commands::server_commands::delete_tag,
            // Snippets
            commands::snippet_commands::list_snippets,
            commands::snippet_commands::create_snippet,
            commands::snippet_commands::update_snippet,
            commands::snippet_commands::delete_snippet,
            // Playbooks
            commands::playbook_commands::list_playbooks,
            commands::playbook_commands::create_playbook,
            commands::playbook_commands::update_playbook,
            commands::playbook_commands::delete_playbook,
            // Search
            commands::search_commands::fuzzy_search,
            // Logs
            commands::log_commands::list_logs,
            commands::log_commands::export_logs_csv,
            commands::log_commands::clear_logs,
            commands::log_commands::get_last_connected_map,
            // Settings
            commands::settings_commands::get_setting,
            commands::settings_commands::set_setting,
            commands::settings_commands::vault_heartbeat,
            // AI Assistant (BYOK)
            commands::assistant_commands::set_assistant_api_key,
            commands::assistant_commands::clear_assistant_api_key,
            commands::assistant_commands::clear_assistant_provider_key,
            commands::assistant_commands::switch_assistant_provider,
            commands::assistant_commands::set_assistant_enabled,
            commands::assistant_commands::get_assistant_status,
            commands::assistant_commands::send_assistant_message,
            commands::assistant_commands::set_assistant_persist_history,
            commands::assistant_commands::save_assistant_chat_history,
            commands::assistant_commands::load_assistant_chat_history,
            // SFTP
            commands::sftp_commands::open_sftp_session,
            commands::sftp_commands::close_sftp_session,
            commands::sftp_commands::list_sftp_dir,
            commands::sftp_commands::mkdir_sftp,
            commands::sftp_commands::delete_sftp,
            commands::sftp_commands::rename_sftp,
            commands::sftp_commands::upload_sftp_file,
            commands::sftp_commands::download_sftp_file,
            commands::sftp_commands::cancel_sftp_transfer,
            commands::sftp_commands::touch_sftp_file,
            commands::sftp_commands::chmod_sftp,
            commands::sftp_commands::open_sftp_edit,
            commands::sftp_commands::close_sftp_edit,
            commands::sftp_commands::copy_sftp_file,
            commands::sftp_commands::cross_copy_sftp_file,
            // Local filesystem
            commands::local_commands::get_local_home_dir,
            commands::local_commands::list_local_dir,
            commands::local_commands::create_local_dir,
            commands::local_commands::create_local_file,
            commands::local_commands::rename_local,
            commands::local_commands::delete_local,
            commands::local_commands::reveal_in_finder,
            commands::local_commands::open_local,
            // SSH
            commands::ssh_commands::launch_in_terminal,
            commands::ssh_commands::import_ssh_config,
            commands::ssh_commands::confirm_ssh_config_import,
            commands::ssh_commands::open_terminal_session,
            commands::ssh_commands::close_terminal_session,
            commands::ssh_commands::send_terminal_input,
            commands::ssh_commands::resize_terminal,
            commands::ssh_commands::remove_known_host_entry,
            // Discovery
            commands::discovery_commands::scan_lan_hosts,
            commands::discovery_commands::import_known_hosts,
            // Tray
            update_tray_menu,
            // Vault
            commands::vault_commands::vault_is_setup,
            commands::vault_commands::vault_setup,
            commands::vault_commands::vault_unlock,
            commands::vault_commands::vault_is_unlocked,
            commands::vault_commands::vault_lock,
            commands::vault_commands::vault_is_password_required,
            commands::vault_commands::vault_skip_setup,
            commands::vault_commands::vault_disable_password,
            commands::vault_commands::vault_enable_password,
            commands::vault_commands::vault_change_password,
            commands::vault_commands::store_credential,
            commands::vault_commands::retrieve_credential,
            commands::vault_commands::delete_credential,
            // SSH Key vault
            commands::key_commands::list_ssh_keys,
            commands::key_commands::add_ssh_key,
            commands::key_commands::remove_ssh_key,
            commands::key_commands::generate_ssh_key,
            commands::key_commands::get_public_key,
            commands::key_commands::rename_ssh_key,
            // Port forwards
            commands::tunnel_commands::list_port_forwards,
            commands::tunnel_commands::create_port_forward,
            commands::tunnel_commands::update_port_forward,
            commands::tunnel_commands::delete_port_forward,
            commands::tunnel_commands::start_tunnel,
            commands::tunnel_commands::stop_tunnel,
            commands::tunnel_commands::list_active_tunnel_ids,
        ])
        .on_menu_event(|app, event| {
            let _ = app.emit(&format!("menu:{}", event.id().as_ref()), ());
        })
        .setup(|app| {
            let menu = build_app_menu(app)?;
            app.set_menu(menu)?;

            let data_dir = app.path().app_local_data_dir()?;

            // Reuse Tauri's own async runtime instead of spinning up a separate
            // tokio::runtime::Runtime (and its full worker thread pool) just for
            // these startup queries.
            let pool = tauri::async_runtime::block_on(db::init_db(data_dir))
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;

            // These reads are independent of each other — run them concurrently
            // rather than as three sequential round trips.
            let (cache_result, password_required_result, initial_failures) =
                tauri::async_runtime::block_on(async {
                    tokio::join!(
                        db::queries::list_servers_db(&pool),
                        vault::master_password::is_password_required(&pool),
                        commands::vault_commands::load_lockout(&pool),
                    )
                });

            let initial_cache = cache_result.unwrap_or_default();
            let password_required = password_required_result.unwrap_or(true);
            let initial_vault_key = if !password_required {
                Some(zeroize::Zeroizing::new([0u8; 32]))
            } else {
                None
            };

            app.manage(AppState {
                db: pool,
                vault_key: tokio::sync::Mutex::new(initial_vault_key),
                unlock_failures: tokio::sync::Mutex::new(initial_failures),
                server_cache: tokio::sync::RwLock::new(initial_cache),
                session_manager: ssh::connection::SessionManager::new(),
                sftp_manager: sftp::SftpManager::new(),
                tunnel_manager: tunnel::TunnelManager::new(),
                last_vault_activity: tokio::sync::Mutex::new(std::time::Instant::now()),
                manually_locked: tokio::sync::Mutex::new(false),
            });

            // Menubar tray icon — starts empty; frontend populates on first server load.
            tray::setup_tray(app.handle())
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;

            // Spawn vault auto-lock background task using Tauri's runtime,
            // which is already active during setup (unlike tokio::spawn).
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                auto_lock_task(handle).await;
            });

            // Spawn the sleep-watcher thread that emits `system:wake` on resume.
            power::start_sleep_watcher(app.handle().clone());

            // Register the `naden` CLI command in ~/.local/bin so the app
            // can be launched from a terminal regardless of install location.
            #[cfg(unix)]
            std::thread::spawn(platform::cli_install::ensure_installed);

            // Install the native macOS drag region monitor for the custom title bar.
            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                platform::macos::install_drag_region(&window);
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Naden")
        .run(|app, event| {
            // On macOS, clicking the Dock icon fires Reopen regardless of
            // whether the window is hidden or miniaturized. A miniaturized
            // window is still "visible" to the OS (hasVisibleWindows == YES),
            // so guarding on has_visible_windows never fires for minimized
            // windows. Instead, unconditionally unminimize + show + focus —
            // these are no-ops when the window is already in the foreground.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        });
}

/// Checks whether the vault should be auto-locked based on the
/// `vault_timeout_minutes` setting and time since last vault activity.
/// Wakes every 30 seconds when a timeout is active; otherwise sleeps for
/// 5 minutes to avoid burning wakeups when auto-lock is disabled.
async fn auto_lock_task(app: tauri::AppHandle) {
    loop {
        let state = app.state::<AppState>();

        // Read timeout setting first so we can choose the right sleep interval.
        let timeout_mins: u64 = match sqlx::query_scalar::<_, String>(
            "SELECT value FROM settings WHERE key = 'vault_timeout_minutes'",
        )
        .fetch_optional(&state.db)
        .await
        {
            Ok(Some(v)) => v.parse().unwrap_or(0),
            Ok(None) => 0,
            Err(e) => {
                eprintln!("[auto-lock] failed to read vault_timeout_minutes: {e}");
                // Sleep briefly then retry rather than silently disabling auto-lock.
                tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                continue;
            }
        };

        if timeout_mins == 0 {
            // Auto-lock is disabled — poll infrequently to detect when it's re-enabled.
            tokio::time::sleep(std::time::Duration::from_secs(300)).await;
            continue;
        }

        // Auto-lock only makes sense when a master password is required; without one
        // the heartbeat immediately restores the key on the next tick, making the lock
        // a no-op that just breaks in-flight credential lookups.
        let password_required = vault::master_password::is_password_required(&state.db)
            .await
            .unwrap_or(true);
        if !password_required {
            tokio::time::sleep(std::time::Duration::from_secs(300)).await;
            continue;
        }

        // Skip lock check if vault is already locked.
        if state.vault_key.lock().await.is_none() {
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
            continue;
        }

        let elapsed = state.last_vault_activity.lock().await.elapsed();

        if elapsed >= std::time::Duration::from_secs(timeout_mins * 60) {
            *state.vault_key.lock().await = None;
            let _ = app.emit("vault_auto_locked", ());
        }

        tokio::time::sleep(std::time::Duration::from_secs(30)).await;
    }
}

fn build_app_menu(
    app: &tauri::App,
) -> Result<tauri::menu::Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

    let app_menu = Submenu::with_items(
        app,
        "Naden",
        true,
        &[
            &PredefinedMenuItem::about(app, None, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &MenuItem::with_id(
                app,
                "new_connection",
                "New Connection",
                true,
                Some("CmdOrCtrl+N"),
            )?,
            &MenuItem::with_id(
                app,
                "import_ssh_config",
                "Import SSH Config…",
                true,
                None::<&str>,
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "lock_vault", "Lock Vault", true, Some("CmdOrCtrl+L"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &MenuItem::with_id(app, "show_logs", "Show Logs", true, None::<&str>)?,
            &MenuItem::with_id(app, "show_snippets", "Show Snippets", true, None::<&str>)?,
            &MenuItem::with_id(app, "show_playbooks", "Show Playbooks", true, None::<&str>)?,
            &MenuItem::with_id(app, "show_tunnels", "Show Tunnels", true, None::<&str>)?,
            &MenuItem::with_id(app, "show_keys", "Show Vault", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                "toggle_sidebar",
                "Toggle Sidebar",
                true,
                Some("CmdOrCtrl+B"),
            )?,
        ],
    )?;

    let window_menu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    Ok(Menu::with_items(
        app,
        &[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu],
    )?)
}
