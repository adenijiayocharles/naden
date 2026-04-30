use crate::db::queries;
use crate::error::AppError;
use crate::models::server::{CreateServerPayload, ServerWithTags};
use crate::ssh::{
    config_parser::{self, ImportPreview},
    launcher,
};
use crate::AppState;

#[tauri::command]
pub async fn launch_in_terminal(
    server_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let server = queries::get_server_db(&state.db, &server_id).await?;
    launcher::launch_in_system_terminal(&server).await
}

#[tauri::command]
pub async fn import_ssh_config(
    path: Option<String>,
    _state: tauri::State<'_, AppState>,
) -> Result<Vec<ImportPreview>, AppError> {
    let config_path = match path {
        Some(p) => std::path::PathBuf::from(p),
        None => dirs::home_dir()
            .ok_or_else(|| AppError::Ssh("cannot determine home directory".into()))?
            .join(".ssh")
            .join("config"),
    };

    config_parser::parse_ssh_config(&config_path)
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
            group_id: None,
            notes: None,
            is_jump_host: None,
            jump_host_id: None,
            tag_ids: None,
        };

        created.push(queries::create_server_db(&state.db, &payload).await?);
    }

    Ok(created)
}
