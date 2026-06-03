use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};

#[derive(serde::Deserialize, Clone)]
pub struct TrayServer {
    pub id: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    #[allow(dead_code)]
    pub hostname: String,
}

#[derive(serde::Serialize, Clone)]
struct TrayConnectPayload {
    #[serde(rename = "serverId")]
    server_id: String,
    mode: String,
}

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = empty_menu(app)?;
    let icon = tauri::image::Image::from_bytes(include_bytes!("../../public/images/menubar.png"))?;

    TrayIconBuilder::with_id("sshelter")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .tooltip("SSHelter")
        .on_menu_event(|app, event| handle_menu_event(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            // Left-click without opening the menu: show the window.
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } = event
            {
                show_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

/// Called by the frontend after any server list mutation.
pub fn rebuild(app: &AppHandle, servers: &[TrayServer]) -> tauri::Result<()> {
    let Some(tray) = app.tray_by_id("sshelter") else {
        return Ok(());
    };
    let menu = server_menu(app, servers)?;
    tray.set_menu(Some(menu))?;
    Ok(())
}

// ── Menu builders ─────────────────────────────────────────────────────────────

fn empty_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let show = MenuItem::with_id(app, "tray_show", "Open SSHelter", true, None::<&str>)?;
    let no_servers = MenuItem::with_id(app, "tray_empty", "No servers yet", false, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = PredefinedMenuItem::quit(app, Some("Quit SSHelter"))?;
    Menu::with_items(app, &[&show, &no_servers, &sep, &quit])
}

fn server_menu(app: &AppHandle, servers: &[TrayServer]) -> tauri::Result<Menu<tauri::Wry>> {
    let show = MenuItem::with_id(app, "tray_show", "Open SSHelter", true, None::<&str>)?;
    let sep_bottom = PredefinedMenuItem::separator(app)?;
    let quit = PredefinedMenuItem::quit(app, Some("Quit SSHelter"))?;

    if servers.is_empty() {
        let no_servers =
            MenuItem::with_id(app, "tray_empty", "No servers yet", false, None::<&str>)?;
        return Menu::with_items(app, &[&show, &no_servers, &sep_bottom, &quit]);
    }

    let sep_top = PredefinedMenuItem::separator(app)?;

    // Build all submenus first so they live long enough for `Menu::with_items`.
    let submenus: Result<Vec<Submenu<tauri::Wry>>, _> = servers
        .iter()
        .map(|s| {
            let term = MenuItem::with_id(
                app,
                format!("tray_term:{}", s.id),
                "Connect (Terminal)",
                true,
                None::<&str>,
            )?;
            let sftp = MenuItem::with_id(
                app,
                format!("tray_sftp:{}", s.id),
                "Open SFTP",
                true,
                None::<&str>,
            )?;
            Submenu::with_items(app, &s.display_name, true, &[&term, &sftp])
        })
        .collect();
    let submenus = submenus?;

    let mut items: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = vec![&show, &sep_top];
    for sub in &submenus {
        items.push(sub);
    }
    items.push(&sep_bottom);
    items.push(&quit);

    Menu::with_items(app, &items)
}

// ── Event handling ────────────────────────────────────────────────────────────

fn handle_menu_event(app: &AppHandle, id: &str) {
    if id == "tray_show" {
        show_window(app);
        return;
    }
    if let Some(server_id) = id.strip_prefix("tray_term:") {
        show_window(app);
        let _ = app.emit(
            "tray:connect",
            TrayConnectPayload {
                server_id: server_id.to_owned(),
                mode: "terminal".to_owned(),
            },
        );
        return;
    }
    if let Some(server_id) = id.strip_prefix("tray_sftp:") {
        show_window(app);
        let _ = app.emit(
            "tray:connect",
            TrayConnectPayload {
                server_id: server_id.to_owned(),
                mode: "sftp".to_owned(),
            },
        );
    }
}

fn show_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}
