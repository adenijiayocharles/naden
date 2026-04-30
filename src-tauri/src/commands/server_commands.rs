use crate::db::queries;
use crate::error::AppError;
use crate::models::server::{CreateServerPayload, Group, ServerWithTags, Tag, UpdateServerPayload};
use crate::AppState;

async fn refresh_cache(state: &tauri::State<'_, AppState>) {
    if let Ok(fresh) = queries::list_servers_db(&state.db).await {
        *state.server_cache.write().await = fresh;
    }
}

#[tauri::command]
pub async fn list_servers(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ServerWithTags>, AppError> {
    // Return straight from cache — already sorted by display_name
    Ok(state.server_cache.read().await.clone())
}

#[tauri::command]
pub async fn get_server(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<ServerWithTags, AppError> {
    queries::get_server_db(&state.db, &id).await
}

#[tauri::command]
pub async fn create_server(
    payload: CreateServerPayload,
    state: tauri::State<'_, AppState>,
) -> Result<ServerWithTags, AppError> {
    let result = queries::create_server_db(&state.db, &payload).await?;
    refresh_cache(&state).await;
    Ok(result)
}

#[tauri::command]
pub async fn update_server(
    id: String,
    payload: UpdateServerPayload,
    state: tauri::State<'_, AppState>,
) -> Result<ServerWithTags, AppError> {
    let result = queries::update_server_db(&state.db, &id, &payload).await?;
    refresh_cache(&state).await;
    Ok(result)
}

#[tauri::command]
pub async fn delete_server(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    queries::delete_server_db(&state.db, &id).await?;
    refresh_cache(&state).await;
    Ok(())
}

#[tauri::command]
pub async fn list_groups(state: tauri::State<'_, AppState>) -> Result<Vec<Group>, AppError> {
    queries::list_groups_db(&state.db).await
}

#[tauri::command]
pub async fn create_group(
    name: String,
    color: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Group, AppError> {
    queries::create_group_db(&state.db, &name, color.as_deref()).await
}

#[tauri::command]
pub async fn list_tags(state: tauri::State<'_, AppState>) -> Result<Vec<Tag>, AppError> {
    queries::list_tags_db(&state.db).await
}

#[tauri::command]
pub async fn create_tag(
    name: String,
    state: tauri::State<'_, AppState>,
) -> Result<Tag, AppError> {
    queries::create_tag_db(&state.db, &name).await
}
