use crate::error::AppError;
use crate::models::server::ServerWithTags;
use crate::search;
use crate::AppState;

#[tauri::command]
pub async fn fuzzy_search(
    query: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ServerWithTags>, AppError> {
    let cache = state.server_cache.read().await;
    Ok(search::filter_servers(&cache, &query))
}
