use crate::error::AppError;
use crate::models::playbook::{
    CreatePlaybookPayload, Playbook, PlaybookRow, PlaybookStep, StepInput, UpdatePlaybookPayload,
};
use crate::AppState;
use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

async fn assemble_playbooks(db: &SqlitePool, rows: Vec<PlaybookRow>) -> Result<Vec<Playbook>, AppError> {
    let steps: Vec<(String, PlaybookStep)> = sqlx::query_as::<_, (String, String, i64, String, i64)>(
        "SELECT playbook_id, id, position, command, delay_ms
         FROM playbook_steps ORDER BY playbook_id ASC, position ASC",
    )
    .fetch_all(db)
    .await?
    .into_iter()
    .map(|(playbook_id, id, position, command, delay_ms)| {
        (playbook_id, PlaybookStep { id, position, command, delay_ms })
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
    let row: PlaybookRow =
        sqlx::query_as("SELECT id, title, description, created_at, updated_at FROM playbooks WHERE id = ?")
            .bind(id)
            .fetch_one(db)
            .await?;
    let mut playbooks = assemble_playbooks(db, vec![row]).await?;
    Ok(playbooks.remove(0))
}

async fn list_playbooks_db(db: &SqlitePool) -> Result<Vec<Playbook>, AppError> {
    let rows: Vec<PlaybookRow> =
        sqlx::query_as("SELECT id, title, description, created_at, updated_at FROM playbooks ORDER BY title ASC")
            .fetch_all(db)
            .await?;
    assemble_playbooks(db, rows).await
}

async fn create_playbook_db(db: &SqlitePool, payload: &CreatePlaybookPayload) -> Result<Playbook, AppError> {
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
    sqlx::query("DELETE FROM playbooks WHERE id = ?")
        .bind(id)
        .execute(db)
        .await?;
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
pub async fn delete_playbook(id: String, state: tauri::State<'_, AppState>) -> Result<(), AppError> {
    delete_playbook_db(&state.db, &id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .expect("failed to open in-memory db");

        sqlx::query("PRAGMA foreign_keys = ON").execute(&pool).await.unwrap();
        sqlx::migrate!("src/db/migrations").run(&pool).await.expect("migrations failed");

        pool
    }

    fn step(command: &str, delay_ms: i64) -> StepInput {
        StepInput { command: command.to_string(), delay_ms }
    }

    #[tokio::test]
    async fn create_playbook_persists_steps_in_order() {
        let db = test_pool().await;
        let payload = CreatePlaybookPayload {
            title: "Restart nginx".into(),
            description: None,
            steps: vec![step("sudo systemctl stop nginx", 200), step("sudo systemctl start nginx", 500)],
        };

        let created = create_playbook_db(&db, &payload).await.unwrap();

        assert_eq!(
            created.steps.iter().map(|s| s.command.as_str()).collect::<Vec<_>>(),
            vec!["sudo systemctl stop nginx", "sudo systemctl start nginx"]
        );
    }

    #[tokio::test]
    async fn list_playbooks_returns_steps_ordered_by_position() {
        let db = test_pool().await;
        create_playbook_db(
            &db,
            &CreatePlaybookPayload {
                title: "Deploy".into(),
                description: Some("Pulls and restarts".into()),
                steps: vec![step("git pull", 100), step("make build", 100), step("make restart", 100)],
            },
        )
        .await
        .unwrap();

        let playbooks = list_playbooks_db(&db).await.unwrap();

        assert_eq!(
            playbooks[0].steps.iter().map(|s| s.command.as_str()).collect::<Vec<_>>(),
            vec!["git pull", "make build", "make restart"]
        );
    }

    #[tokio::test]
    async fn update_playbook_replaces_steps_rather_than_appending() {
        let db = test_pool().await;
        let created = create_playbook_db(
            &db,
            &CreatePlaybookPayload {
                title: "Tail logs".into(),
                description: None,
                steps: vec![step("tail -f /var/log/syslog", 0)],
            },
        )
        .await
        .unwrap();

        let updated = update_playbook_db(
            &db,
            &created.id,
            &UpdatePlaybookPayload {
                title: "Tail logs".into(),
                description: None,
                steps: vec![step("tail -f /var/log/nginx/access.log", 0), step("tail -f /var/log/nginx/error.log", 0)],
            },
        )
        .await
        .unwrap();

        assert_eq!(
            updated.steps.iter().map(|s| s.command.as_str()).collect::<Vec<_>>(),
            vec!["tail -f /var/log/nginx/access.log", "tail -f /var/log/nginx/error.log"]
        );
    }

    #[tokio::test]
    async fn delete_playbook_cascades_to_steps() {
        let db = test_pool().await;
        let created = create_playbook_db(
            &db,
            &CreatePlaybookPayload {
                title: "One-off".into(),
                description: None,
                steps: vec![step("uptime", 0)],
            },
        )
        .await
        .unwrap();

        delete_playbook_db(&db, &created.id).await.unwrap();

        let remaining_steps: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM playbook_steps WHERE playbook_id = ?")
            .bind(&created.id)
            .fetch_one(&db)
            .await
            .unwrap();
        assert_eq!(remaining_steps, 0);
    }
}
