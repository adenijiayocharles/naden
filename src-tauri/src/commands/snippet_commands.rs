use crate::error::AppError;
use crate::models::snippet::{CreateSnippetPayload, Snippet, UpdateSnippetPayload};
use crate::AppState;
use chrono::Utc;
use uuid::Uuid;

#[tauri::command]
pub async fn list_snippets(state: tauri::State<'_, AppState>) -> Result<Vec<Snippet>, AppError> {
    Ok(sqlx::query_as(
        "SELECT id, title, body, created_at, updated_at FROM snippets ORDER BY title ASC",
    )
    .fetch_all(&state.db)
    .await?)
}

#[tauri::command]
pub async fn create_snippet(
    payload: CreateSnippetPayload,
    state: tauri::State<'_, AppState>,
) -> Result<Snippet, AppError> {
    if payload.title.trim().is_empty() {
        return Err(AppError::Validation("title is required".into()));
    }
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO snippets (id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(payload.title.trim())
    .bind(&payload.body)
    .bind(&now)
    .bind(&now)
    .execute(&state.db)
    .await?;
    Ok(
        sqlx::query_as("SELECT id, title, body, created_at, updated_at FROM snippets WHERE id = ?")
            .bind(&id)
            .fetch_one(&state.db)
            .await?,
    )
}

#[tauri::command]
pub async fn update_snippet(
    id: String,
    payload: UpdateSnippetPayload,
    state: tauri::State<'_, AppState>,
) -> Result<Snippet, AppError> {
    if payload.title.trim().is_empty() {
        return Err(AppError::Validation("title is required".into()));
    }
    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE snippets SET title = ?, body = ?, updated_at = ? WHERE id = ?")
        .bind(payload.title.trim())
        .bind(&payload.body)
        .bind(&now)
        .bind(&id)
        .execute(&state.db)
        .await?;
    Ok(
        sqlx::query_as("SELECT id, title, body, created_at, updated_at FROM snippets WHERE id = ?")
            .bind(&id)
            .fetch_one(&state.db)
            .await?,
    )
}

#[tauri::command]
pub async fn delete_snippet(id: String, state: tauri::State<'_, AppState>) -> Result<(), AppError> {
    sqlx::query("DELETE FROM snippets WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await?;
    Ok(())
}
