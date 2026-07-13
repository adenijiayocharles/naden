use std::collections::BTreeMap;

use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};

#[derive(serde::Deserialize, Clone)]
pub struct TrayServer {
    pub id: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    #[allow(dead_code)]
    pub hostname: String,
    #[serde(rename = "groupName")]
    pub group_name: Option<String>,
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

    TrayIconBuilder::with_id("naden")
        .icon(icon)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .tooltip("naden")
        .on_menu_event(|app, event| handle_menu_event(app, event.id().as_ref()))
        .build(app)?;

    Ok(())
}

/// Called by the frontend after any server list mutation.
pub fn rebuild(app: &AppHandle, servers: &[TrayServer]) -> tauri::Result<()> {
    let Some(tray) = app.tray_by_id("naden") else {
        return Ok(());
    };
    let menu = server_menu(app, servers)?;
    tray.set_menu(Some(menu))?;
    Ok(())
}

// ── Menu builders ─────────────────────────────────────────────────────────────

fn empty_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let show = MenuItem::with_id(app, "tray_show", "Open naden", true, None::<&str>)?;
    let no_servers = MenuItem::with_id(app, "tray_empty", "No servers yet", false, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = PredefinedMenuItem::quit(app, Some("Quit naden"))?;
    Menu::with_items(app, &[&show, &no_servers, &sep, &quit])
}

fn server_menu(app: &AppHandle, servers: &[TrayServer]) -> tauri::Result<Menu<tauri::Wry>> {
    let show = MenuItem::with_id(app, "tray_show", "Open naden", true, None::<&str>)?;
    let sep_bottom = PredefinedMenuItem::separator(app)?;
    let quit = PredefinedMenuItem::quit(app, Some("Quit naden"))?;

    if servers.is_empty() {
        let no_servers =
            MenuItem::with_id(app, "tray_empty", "No servers yet", false, None::<&str>)?;
        return Menu::with_items(app, &[&show, &no_servers, &sep_bottom, &quit]);
    }

    let sep_top = PredefinedMenuItem::separator(app)?;

    // Group servers by group name (alphabetical, matching `list_groups_db`'s
    // `ORDER BY name`); servers with no group stay flat, as before.
    let mut grouped: BTreeMap<&str, Vec<&TrayServer>> = BTreeMap::new();
    let mut ungrouped: Vec<&TrayServer> = Vec::new();
    for s in servers {
        match s.group_name.as_deref() {
            Some(name) if !name.is_empty() => grouped.entry(name).or_default().push(s),
            _ => ungrouped.push(s),
        }
    }

    // Build all submenus first so they live long enough for `Menu::with_items`.
    let group_submenus: Result<Vec<Submenu<tauri::Wry>>, _> = grouped
        .iter()
        .map(|(group_name, group_servers)| {
            let server_subs: Result<Vec<Submenu<tauri::Wry>>, _> = group_servers
                .iter()
                .map(|s| server_submenu(app, s))
                .collect();
            let server_subs = server_subs?;
            let refs: Vec<&dyn IsMenuItem<tauri::Wry>> = server_subs
                .iter()
                .map(|s| s as &dyn IsMenuItem<tauri::Wry>)
                .collect();
            Submenu::with_items(app, *group_name, true, &refs)
        })
        .collect();
    let group_submenus = group_submenus?;

    let ungrouped_submenus: Result<Vec<Submenu<tauri::Wry>>, _> =
        ungrouped.iter().map(|s| server_submenu(app, s)).collect();
    let ungrouped_submenus = ungrouped_submenus?;

    let mut items: Vec<&dyn IsMenuItem<tauri::Wry>> = vec![&show, &sep_top];
    for sub in &group_submenus {
        items.push(sub);
    }
    for sub in &ungrouped_submenus {
        items.push(sub);
    }
    items.push(&sep_bottom);
    items.push(&quit);

    Menu::with_items(app, &items)
}

fn server_submenu(app: &AppHandle, s: &TrayServer) -> tauri::Result<Submenu<tauri::Wry>> {
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
