use crate::error::AppError;
use crate::models::playbook::{
    CreatePlaybookPayload, Playbook, PlaybookRow, PlaybookStep, StepInput, UpdatePlaybookPayload,
};
use crate::AppState;
use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

async fn assemble_playbooks(
    db: &SqlitePool,
    rows: Vec<PlaybookRow>,
) -> Result<Vec<Playbook>, AppError> {
    let steps: Vec<(String, PlaybookStep)> =
        sqlx::query_as::<_, (String, String, i64, String, i64)>(
            "SELECT playbook_id, id, position, command, delay_ms
         FROM playbook_steps ORDER BY playbook_id ASC, position ASC",
        )
        .fetch_all(db)
        .await?
        .into_iter()
        .map(|(playbook_id, id, position, command, delay_ms)| {
            (
                playbook_id,
                PlaybookStep {
                    id,
                    position,
                    command,
                    delay_ms,
                },
            )
        })
        .collect();

    Ok(rows
        .into_iter()
        .map(|row| {
            let steps = steps
                .iter()
                .filter(|(playbook_id, _)| playbook_id == &row.id)
                .map(|(_, step)| step.clone())
                .collect();
            Playbook {
                id: row.id,
                title: row.title,
                description: row.description,
                steps,
                created_at: row.created_at,
                updated_at: row.updated_at,
            }
        })
        .collect())
}

async fn insert_steps(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    playbook_id: &str,
    steps: &[StepInput],
) -> Result<(), AppError> {
    for (position, step) in steps.iter().enumerate() {
        sqlx::query(
            "INSERT INTO playbook_steps (id, playbook_id, position, command, delay_ms)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(playbook_id)
        .bind(position as i64)
        .bind(&step.command)
        .bind(step.delay_ms)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

async fn get_playbook_db(db: &SqlitePool, id: &str) -> Result<Playbook, AppError> {
    let row: PlaybookRow = sqlx::query_as(
        "SELECT id, title, description, created_at, updated_at FROM playbooks WHERE id = ?",
    )
    .bind(id)
    .fetch_one(db)
    .await?;
    let mut playbooks = assemble_playbooks(db, vec![row]).await?;
    Ok(playbooks.remove(0))
}

async fn list_playbooks_db(db: &SqlitePool) -> Result<Vec<Playbook>, AppError> {
    let rows: Vec<PlaybookRow> = sqlx::query_as(
        "SELECT id, title, description, created_at, updated_at FROM playbooks ORDER BY title ASC",
    )
    .fetch_all(db)
    .await?;
    assemble_playbooks(db, rows).await
}

async fn create_playbook_db(
    db: &SqlitePool,
    payload: &CreatePlaybookPayload,
) -> Result<Playbook, AppError> {
    if payload.title.trim().is_empty() {
        return Err(AppError::Validation("title is required".into()));
    }
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    let mut tx = db.begin().await?;

    sqlx::query(
        "INSERT INTO playbooks (id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(payload.title.trim())
    .bind(payload.description.as_deref().filter(|d| !d.is_empty()))
    .bind(&now)
    .bind(&now)
    .execute(&mut *tx)
    .await?;

    insert_steps(&mut tx, &id, &payload.steps).await?;

    tx.commit().await?;

    get_playbook_db(db, &id).await
}

async fn update_playbook_db(
    db: &SqlitePool,
    id: &str,
    payload: &UpdatePlaybookPayload,
) -> Result<Playbook, AppError> {
    if payload.title.trim().is_empty() {
        return Err(AppError::Validation("title is required".into()));
    }
    let now = Utc::now().to_rfc3339();

    let mut tx = db.begin().await?;

    sqlx::query("UPDATE playbooks SET title = ?, description = ?, updated_at = ? WHERE id = ?")
        .bind(payload.title.trim())
        .bind(payload.description.as_deref().filter(|d| !d.is_empty()))
        .bind(&now)
        .bind(id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM playbook_steps WHERE playbook_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    insert_steps(&mut tx, id, &payload.steps).await?;

    tx.commit().await?;

    get_playbook_db(db, id).await
}

async fn delete_playbook_db(db: &SqlitePool, id: &str) -> Result<(), AppError> {
    let result = sqlx::query("DELETE FROM playbooks WHERE id = ?")
        .bind(id)
        .execute(db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("playbook '{id}' not found")));
    }
    Ok(())
}

#[tauri::command]
pub async fn list_playbooks(state: tauri::State<'_, AppState>) -> Result<Vec<Playbook>, AppError> {
    list_playbooks_db(&state.db).await
}

#[tauri::command]
pub async fn create_playbook(
    payload: CreatePlaybookPayload,
    state: tauri::State<'_, AppState>,
) -> Result<Playbook, AppError> {
    create_playbook_db(&state.db, &payload).await
}

#[tauri::command]
pub async fn update_playbook(
    id: String,
    payload: UpdatePlaybookPayload,
    state: tauri::State<'_, AppState>,
) -> Result<Playbook, AppError> {
    update_playbook_db(&state.db, &id, &payload).await
}

#[tauri::command]
pub async fn delete_playbook(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    delete_playbook_db(&state.db, &id).await
}

#[cfg(test)]
#[path = "playbook_commands_tests.rs"]
mod tests;
