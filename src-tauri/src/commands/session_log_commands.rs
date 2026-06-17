use base64::Engine as _;
use chrono::Utc;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::session_log::SessionLog;
use crate::AppState;

fn logs_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, AppError> {
    use tauri::Manager;
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| AppError::Io(format!("Cannot resolve app data dir: {e}")))?;
    let dir = data_dir.join("session_logs");
    std::fs::create_dir_all(&dir)
        .map_err(|e| AppError::Io(format!("Cannot create session_logs dir: {e}")))?;
    Ok(dir)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionLogMeta {
    pub id: String,
    pub file_path: String,
}

#[tauri::command]
pub async fn create_session_log(
    server_id: Option<String>,
    server_display_name: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<SessionLogMeta, AppError> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let dir = logs_dir(&app)?;
    let file_path = dir.join(format!("{id}.log"));
    std::fs::write(&file_path, b"")
        .map_err(|e| AppError::Io(format!("Cannot create log file: {e}")))?;
    let file_path_str = file_path.to_string_lossy().to_string();

    sqlx::query(
        "INSERT INTO session_logs (id, server_id, server_display_name, file_path, start_time, created_at)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&server_id)
    .bind(&server_display_name)
    .bind(&file_path_str)
    .bind(&now)
    .bind(&now)
    .execute(&state.db)
    .await?;

    Ok(SessionLogMeta {
        id,
        file_path: file_path_str,
    })
}

#[tauri::command]
pub async fn append_session_log(
    log_id: String,
    data_base64: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let file_path: Option<String> =
        sqlx::query_scalar("SELECT file_path FROM session_logs WHERE id = ?")
            .bind(&log_id)
            .fetch_optional(&state.db)
            .await?;

    let path =
        file_path.ok_or_else(|| AppError::NotFound(format!("session log {log_id} not found")))?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data_base64)
        .map_err(|e| AppError::Io(format!("Invalid base64: {e}")))?;

    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .append(true)
        .open(&path)
        .map_err(|e| AppError::Io(format!("Cannot open log file: {e}")))?;
    file.write_all(&bytes)
        .map_err(|e| AppError::Io(format!("Cannot write to log file: {e}")))?;

    Ok(())
}

#[tauri::command]
pub async fn finish_session_log(
    log_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let file_path: Option<String> =
        sqlx::query_scalar("SELECT file_path FROM session_logs WHERE id = ?")
            .bind(&log_id)
            .fetch_optional(&state.db)
            .await?;

    let now = Utc::now().to_rfc3339();
    let file_size = file_path
        .as_deref()
        .and_then(|p| std::fs::metadata(p).ok())
        .map(|m| m.len() as i64);

    sqlx::query("UPDATE session_logs SET end_time = ?, file_size_bytes = ? WHERE id = ?")
        .bind(&now)
        .bind(file_size)
        .bind(&log_id)
        .execute(&state.db)
        .await?;

    Ok(())
}

#[tauri::command]
pub async fn list_session_logs(
    server_id: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<SessionLog>, AppError> {
    Ok(sqlx::query_as::<_, SessionLog>(
        "SELECT * FROM session_logs
         WHERE (? IS NULL OR server_id = ?)
         ORDER BY start_time DESC
         LIMIT 200",
    )
    .bind(&server_id)
    .bind(&server_id)
    .fetch_all(&state.db)
    .await?)
}

#[tauri::command]
pub async fn delete_session_log(
    log_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let file_path: Option<String> =
        sqlx::query_scalar("SELECT file_path FROM session_logs WHERE id = ?")
            .bind(&log_id)
            .fetch_optional(&state.db)
            .await?;

    if let Some(ref path) = file_path {
        let _ = std::fs::remove_file(path);
    }

    sqlx::query("DELETE FROM session_logs WHERE id = ?")
        .bind(&log_id)
        .execute(&state.db)
        .await?;

    Ok(())
}

#[tauri::command]
pub fn reveal_session_log(file_path: String) -> Result<(), AppError> {
    std::process::Command::new("open")
        .args(["-R", &file_path])
        .spawn()
        .map(|_| ())
        .map_err(|e| AppError::Io(format!("Cannot reveal in Finder: {e}")))
}
