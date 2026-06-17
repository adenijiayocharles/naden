use crate::error::AppError;
use crate::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedBroadcastGroup {
    pub id: String,
    pub name: String,
    pub server_ids: Vec<String>,
}

#[tauri::command]
pub async fn list_broadcast_groups(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<SavedBroadcastGroup>, AppError> {
    let rows: Vec<(String, String)> =
        sqlx::query_as("SELECT id, name FROM broadcast_groups ORDER BY created_at")
            .fetch_all(&state.db)
            .await?;

    let mut groups = Vec::with_capacity(rows.len());
    for (id, name) in rows {
        let server_ids: Vec<String> = sqlx::query_scalar(
            "SELECT server_id FROM broadcast_group_members WHERE group_id = ? ORDER BY rowid",
        )
        .bind(&id)
        .fetch_all(&state.db)
        .await?;
        groups.push(SavedBroadcastGroup {
            id,
            name,
            server_ids,
        });
    }
    Ok(groups)
}

#[tauri::command]
pub async fn create_broadcast_group(
    name: String,
    server_ids: Vec<String>,
    state: tauri::State<'_, AppState>,
) -> Result<SavedBroadcastGroup, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("name is required".into()));
    }
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    let mut tx = state.db.begin().await?;
    sqlx::query(
        "INSERT INTO broadcast_groups (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(name.trim())
    .bind(&now)
    .bind(&now)
    .execute(&mut *tx)
    .await?;

    for server_id in &server_ids {
        sqlx::query(
            "INSERT OR IGNORE INTO broadcast_group_members (group_id, server_id) VALUES (?, ?)",
        )
        .bind(&id)
        .bind(server_id)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    Ok(SavedBroadcastGroup {
        id,
        name: name.trim().to_string(),
        server_ids,
    })
}

#[tauri::command]
pub async fn delete_broadcast_group(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let rows = sqlx::query("DELETE FROM broadcast_groups WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await?
        .rows_affected();
    if rows == 0 {
        return Err(AppError::NotFound(format!(
            "broadcast group '{id}' not found"
        )));
    }
    Ok(())
}
