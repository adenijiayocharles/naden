use std::sync::{Arc, Mutex};

use tauri::{Emitter, Manager};

mod assistant;
mod commands;
mod crash_reporting;
mod db;
mod discovery;
pub mod error;
mod local_terminal;
mod models;
mod platform;
mod power;
mod search;
mod sftp;
mod ssh;
mod tray;
mod tunnel;
mod vault;

/// Timestamp of the last `export_ssh_config` write; used by the file-watcher
/// to suppress notifications triggered by Naden's own writes.
pub struct SshConfigExportTs(pub Arc<Mutex<std::time::Instant>>);

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
    // Show a native alert and write a crash log instead of silently aborting.
    // Tauri panics when the setup closure returns Err — that panic then fires
    // inside macOS's `did_finish_launching` ObjC callback, which can't unwind
    // Rust stack frames, resulting in SIGABRT with no user-visible message.
    std::panic::set_hook(Box::new(|info| {
        let msg = info
            .payload()
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| info.payload().downcast_ref::<String>().map(String::as_str))
            .unwrap_or("unknown error");
        let location = info
            .location()
            .map(|l| format!(" ({}:{})", l.file(), l.line()))
            .unwrap_or_default();
        let full = format!("{msg}{location}");
        eprintln!("[naden] startup panic: {full}");
        let log_path = std::env::temp_dir().join("naden_crash.log");
        let _ = std::fs::write(&log_path, &full);
        #[cfg(target_os = "macos")]
        let _ = std::process::Command::new("osascript")
            .arg("-e")
            .arg(format!(
                r#"display alert "naden failed to start" message "{}" buttons {{"OK"}} default button "OK""#,
                msg.replace('\\', "\\\\").replace('"', "\\\"")
            ))
            .status();
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .max_file_size(5 * 1024 * 1024)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .build(),
        )
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
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
            commands::server_commands::reorder_servers,
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
            commands::settings_commands::get_all_settings,
            commands::settings_commands::set_setting,
            commands::settings_commands::vault_heartbeat,
            crash_reporting::crash_reporting_is_available,
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
            commands::sftp_commands::download_sftp_as_zip,
            commands::sftp_commands::unzip_sftp_file,
            // Local filesystem
            commands::local_commands::get_local_home_dir,
            commands::local_commands::list_local_dir,
            commands::local_commands::create_local_dir,
            commands::local_commands::create_local_file,
            commands::local_commands::rename_local,
            commands::local_commands::delete_local,
            commands::local_commands::reveal_in_finder,
            commands::local_commands::open_local,
            commands::local_commands::open_local_session,
            // SSH
            commands::ssh_commands::launch_in_terminal,
            commands::ssh_commands::import_ssh_config,
            commands::ssh_commands::confirm_ssh_config_import,
            commands::ssh_commands::export_ssh_config,
            commands::ssh_commands::open_terminal_session,
            commands::ssh_commands::close_terminal_session,
            commands::ssh_commands::send_terminal_input,
            commands::ssh_commands::resize_terminal,
            commands::ssh_commands::confirm_host_key,
            commands::ssh_commands::confirm_hooks,
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
            // Vault backup
            commands::backup_commands::backup_vault_db,
            commands::backup_commands::restore_vault_db,
            // SSH Key vault
            commands::key_commands::list_ssh_keys,
            commands::key_commands::add_ssh_key,
            commands::key_commands::remove_ssh_key,
            commands::key_commands::generate_ssh_key,
            commands::key_commands::get_public_key,
            commands::key_commands::rename_ssh_key,
            // Health
            commands::health_commands::fetch_server_health,
            // Broadcast groups
            commands::broadcast_commands::list_broadcast_groups,
            commands::broadcast_commands::create_broadcast_group,
            commands::broadcast_commands::update_broadcast_group,
            commands::broadcast_commands::delete_broadcast_group,
            // Port forwards
            commands::tunnel_commands::list_port_forwards,
            commands::tunnel_commands::create_port_forward,
            commands::tunnel_commands::update_port_forward,
            commands::tunnel_commands::delete_port_forward,
            commands::tunnel_commands::start_tunnel,
            commands::tunnel_commands::stop_tunnel,
            commands::tunnel_commands::list_active_tunnel_ids,
            // Session logs
            commands::session_log_commands::create_session_log,
            commands::session_log_commands::append_session_log,
            commands::session_log_commands::finish_session_log,
            commands::session_log_commands::list_session_logs,
            commands::session_log_commands::delete_session_log,
            commands::session_log_commands::reveal_session_log,
        ])
        .on_menu_event(|app, event| {
            let _ = app.emit(&format!("menu:{}", event.id().as_ref()), ());
        })
        .setup(|app| {
            eprintln!("[naden] setup: building menu");
            let menu = build_app_menu(app)
                .map_err(|e| { eprintln!("[naden] setup: menu failed: {e}"); e })?;
            app.set_menu(menu)
                .map_err(|e| { eprintln!("[naden] setup: set_menu failed: {e}"); e })?;

            eprintln!("[naden] setup: resolving data dir");
            let data_dir = app.path().app_local_data_dir()
                .map_err(|e| { eprintln!("[naden] setup: data dir failed: {e}"); e })?;

            eprintln!("[naden] setup: initialising database at {}", data_dir.display());
            let pool = tauri::async_runtime::block_on(db::init_db(data_dir))
                .map_err(|e| {
                    eprintln!("[naden] setup: db init failed: {e}");
                    Box::new(e) as Box<dyn std::error::Error>
                })?;

            // These reads are independent of each other — run them concurrently
            // rather than as four sequential round trips.
            eprintln!("[naden] setup: loading initial state");
            let (cache_result, password_required_result, initial_failures, crash_reporting_setting) =
                tauri::async_runtime::block_on(async {
                    tokio::join!(
                        db::queries::list_servers_db(&pool),
                        vault::master_password::is_password_required(&pool),
                        commands::vault_commands::load_lockout(&pool),
                        commands::settings_commands::get_setting_value(&pool, "crash_reporting_enabled"),
                    )
                });

            let initial_cache = cache_result.unwrap_or_default();
            let password_required = password_required_result.unwrap_or(true);
            let initial_vault_key = if !password_required {
                // Resolve (or create) the real per-device key immediately so no
                // credential is ever written under the all-zero placeholder key.
                match tauri::async_runtime::block_on(
                    commands::vault_commands::get_or_create_device_key(&pool),
                ) {
                    Ok(k) => Some(zeroize::Zeroizing::new(k)),
                    Err(e) => {
                        eprintln!("[naden] setup: device key init failed: {e}");
                        None
                    }
                }
            } else {
                None
            };

            // checked_sub avoids a panic if system uptime is under 60 seconds.
            let export_ts = std::time::Instant::now()
                .checked_sub(std::time::Duration::from_secs(60))
                .unwrap_or_else(std::time::Instant::now);
            app.manage(SshConfigExportTs(Arc::new(Mutex::new(export_ts))));

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

            // Installed after the panic hook above, which it chains to —
            // the local crash log and native alert keep working unchanged
            // whether or not this actually starts (no DSN compiled in, or
            // the user has left it off, both leave this as `None`).
            let crash_reporting_enabled = crash_reporting_setting.unwrap_or_default().as_deref() != Some("false");
            app.manage(crash_reporting::init(crash_reporting_enabled));

            eprintln!("[naden] setup: initialising tray");
            tray::setup_tray(app.handle())
                .map_err(|e| {
                    eprintln!("[naden] setup: tray failed: {e}");
                    Box::new(e) as Box<dyn std::error::Error>
                })?;

            // Spawn vault auto-lock background task using Tauri's runtime,
            // which is already active during setup (unlike tokio::spawn).
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                auto_lock_task(handle).await;
            });

            // Spawn the sleep-watcher thread that emits `system:wake` on resume.
            power::start_sleep_watcher(app.handle().clone());

            // Spawn the SSH config file-watcher thread that emits `ssh:config-changed`
            // when ~/.ssh/config is modified externally.
            start_ssh_config_watcher(app.handle().clone());

            // Register the `naden` CLI command in ~/.local/bin so the app
            // can be launched from a terminal regardless of install location.
            #[cfg(unix)]
            std::thread::spawn(platform::cli_install::ensure_installed);

            // Restore the window's last size and position, falling back to the
            // defaults in tauri.conf.json if no saved state exists yet.
            if let Some(window) = app.get_webview_window("main") {
                use tauri_plugin_window_state::WindowExt;
                let _ = window.restore_state(tauri_plugin_window_state::StateFlags::SIZE | tauri_plugin_window_state::StateFlags::POSITION);

                // Install the native macOS drag region monitor for the custom title bar.
                #[cfg(target_os = "macos")]
                platform::macos::install_drag_region(&window);
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building naden")
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
                log::error!("[auto-lock] failed to read vault_timeout_minutes: {e}");
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

fn start_ssh_config_watcher(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        use notify::{EventKind, RecursiveMode, Watcher};

        let home = match app.path().home_dir() {
            Ok(h) => h,
            Err(_) => return,
        };
        let ssh_dir = home.join(".ssh");
        if !ssh_dir.exists() {
            return;
        }

        let export_ts = app.state::<SshConfigExportTs>().inner().0.clone();

        let (tx, rx) = std::sync::mpsc::channel::<notify::Result<notify::Event>>();
        let mut watcher = match notify::recommended_watcher(move |ev| {
            tx.send(ev).ok();
        }) {
            Ok(w) => w,
            Err(_) => return,
        };

        if watcher
            .watch(&ssh_dir, RecursiveMode::NonRecursive)
            .is_err()
        {
            return;
        }

        while let Ok(Ok(event)) = rx.recv() {
            // Only care about the config file itself
            if !event
                .paths
                .iter()
                .any(|p| p.file_name().is_some_and(|n| n == "config"))
            {
                continue;
            }

            // Skip read-only access events
            if !matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_)) {
                continue;
            }

            // Debounce: drain all events that arrive within 400 ms
            while rx
                .recv_timeout(std::time::Duration::from_millis(400))
                .is_ok()
            {}

            // Suppress if Naden itself wrote the file recently
            if export_ts
                .lock()
                .map(|ts| ts.elapsed() < std::time::Duration::from_secs(3))
                .unwrap_or(false)
            {
                continue;
            }

            let _ = app.emit("ssh:config-changed", ());
        }
    });
}

fn build_app_menu(
    app: &tauri::App,
) -> Result<tauri::menu::Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

    let app_menu = Submenu::with_items(
        app,
        "naden",
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
