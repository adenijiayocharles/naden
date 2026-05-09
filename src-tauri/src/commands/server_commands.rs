use crate::db::queries;
use crate::error::AppError;
use crate::models::server::{CreateServerPayload, Group, ServerWithTags, Tag, UpdateServerPayload};
use crate::AppState;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReachabilityResult {
    pub reachable: bool,
    pub latency_ms: Option<u64>,
}

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
pub async fn move_server_group(
    server_id: String,
    group_id: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<ServerWithTags, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query("UPDATE servers SET group_id = ?, updated_at = ? WHERE id = ?")
        .bind(group_id.as_deref())
        .bind(&now)
        .bind(&server_id)
        .execute(&state.db)
        .await?;
    refresh_cache(&state).await;
    queries::get_server_db(&state.db, &server_id).await
}

#[tauri::command]
pub async fn toggle_favourite(
    server_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<ServerWithTags, AppError> {
    let server = queries::get_server_db(&state.db, &server_id).await?;
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query("UPDATE servers SET is_favourite = ?, updated_at = ? WHERE id = ?")
        .bind(!server.server.is_favourite)
        .bind(&now)
        .bind(&server_id)
        .execute(&state.db)
        .await?;
    refresh_cache(&state).await;
    queries::get_server_db(&state.db, &server_id).await
}

#[tauri::command]
pub async fn duplicate_server(
    server_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<ServerWithTags, AppError> {
    let original = queries::get_server_db(&state.db, &server_id).await?;
    let s = &original.server;
    let payload = CreateServerPayload {
        display_name: format!("Copy of {}", s.display_name),
        hostname: s.hostname.clone(),
        port: Some(s.port),
        username: Some(s.username.clone()),
        auth_method: Some(s.auth_method.clone()),
        identity_file_path: s.identity_file_path.clone(),
        vault_credential_id: s.vault_credential_id.clone(),
        group_id: s.group_id.clone(),
        notes: s.notes.clone(),
        is_jump_host: Some(s.is_jump_host),
        jump_host_id: s.jump_host_id.clone(),
        tag_ids: Some(original.tags.iter().map(|t| t.id.clone()).collect()),
    };
    let result = queries::create_server_db(&state.db, &payload).await?;
    refresh_cache(&state).await;
    Ok(result)
}

#[tauri::command]
pub async fn get_recent_server_ids(
    limit: i64,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, AppError> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT server_id FROM audit_log
         WHERE server_id IS NOT NULL AND outcome IN ('success', 'user_closed')
         GROUP BY server_id
         ORDER BY MAX(session_start) DESC
         LIMIT ?",
    )
    .bind(limit)
    .fetch_all(&state.db)
    .await?;
    Ok(rows.into_iter().map(|(id,)| id).collect())
}

#[tauri::command]
pub async fn check_reachability(
    server_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<ReachabilityResult, AppError> {
    let server = queries::get_server_db(&state.db, &server_id).await?;
    let host = server.server.hostname.clone();
    let port = u16::try_from(server.server.port).unwrap_or(22);

    let result = tokio::task::spawn_blocking(move || {
        use std::net::ToSocketAddrs;
        use std::time::Instant;

        let addr = format!("{host}:{port}")
            .to_socket_addrs()
            .ok()
            .and_then(|mut it| it.next());

        let Some(addr) = addr else {
            return ReachabilityResult { reachable: false, latency_ms: None };
        };

        let start = Instant::now();
        match std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_secs(3)) {
            Ok(_) => ReachabilityResult {
                reachable: true,
                latency_ms: Some(start.elapsed().as_millis() as u64),
            },
            Err(_) => ReachabilityResult { reachable: false, latency_ms: None },
        }
    })
    .await
    .map_err(|_| AppError::Ssh("connectivity check failed".into()))?;

    Ok(result)
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
pub async fn update_group(
    group_id: String,
    name: String,
    color: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Group, AppError> {
    let group = queries::update_group_db(&state.db, &group_id, &name, color.as_deref()).await?;
    refresh_cache(&state).await;
    Ok(group)
}

#[tauri::command]
pub async fn delete_group(
    group_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    queries::delete_group_db(&state.db, &group_id).await?;
    refresh_cache(&state).await;
    Ok(())
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
