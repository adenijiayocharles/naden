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

async fn get_log_path(log_id: &str, state: &tauri::State<'_, AppState>) -> Result<Option<String>, AppError> {
    let path: Option<String> =
        sqlx::query_scalar("SELECT file_path FROM session_logs WHERE id = ?")
            .bind(log_id)
            .fetch_optional(&state.db)
            .await?;
    Ok(path)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionLogMeta {
    pub id: String,
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
    let file_path_str = file_path.to_string_lossy().to_string();

    // Insert the DB row first so that if file creation fails we can roll back
    // cleanly — orphaned DB rows are invisible to the user, orphaned files are not.
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

    if let Err(e) = std::fs::write(&file_path, b"") {
        let _ = sqlx::query("DELETE FROM session_logs WHERE id = ?")
            .bind(&id)
            .execute(&state.db)
            .await;
        return Err(AppError::Io(format!("Cannot create log file: {e}")));
    }

    Ok(SessionLogMeta { id })
}

#[tauri::command]
pub async fn append_session_log(
    log_id: String,
    data_base64: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let path = get_log_path(&log_id, &state)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("session log {log_id} not found")))?;

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
    let file_path = get_log_path(&log_id, &state).await?;
    let now = Utc::now().to_rfc3339();
    let file_size = file_path
        .as_deref()
        .and_then(|p| std::fs::metadata(p).ok())
        .map(|m| m.len() as i64);

    let result = sqlx::query("UPDATE session_logs SET end_time = ?, file_size_bytes = ? WHERE id = ?")
        .bind(&now)
        .bind(file_size)
        .bind(&log_id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("session log {log_id} not found")));
    }

    Ok(())
}

#[tauri::command]
pub async fn list_session_logs(
    server_id: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<SessionLog>, AppError> {
    let limit = limit.unwrap_or(50).clamp(1, 200);
    let offset = offset.unwrap_or(0).max(0);

    Ok(sqlx::query_as::<_, SessionLog>(
        "SELECT * FROM session_logs
         WHERE (? IS NULL OR server_id = ?)
         ORDER BY start_time DESC
         LIMIT ? OFFSET ?",
    )
    .bind(&server_id)
    .bind(&server_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await?)
}

#[tauri::command]
pub async fn delete_session_log(
    log_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let file_path = get_log_path(&log_id, &state).await?;

    if let Some(ref path) = file_path {
        if let Err(e) = std::fs::remove_file(path) {
            // Ignore NotFound — user may have deleted it manually outside the app.
            if e.kind() != std::io::ErrorKind::NotFound {
                return Err(AppError::Io(format!("Cannot delete log file: {e}")));
            }
        }
    }

    sqlx::query("DELETE FROM session_logs WHERE id = ?")
        .bind(&log_id)
        .execute(&state.db)
        .await?;

    Ok(())
}

#[tauri::command]
pub async fn reveal_session_log(
    log_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let path = get_log_path(&log_id, &state)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("session log {log_id} not found")))?;

    reveal_path(&path)
}

fn reveal_path(path: &str) -> Result<(), AppError> {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .args(["-R", path])
        .spawn()
        .map_err(|e| AppError::Io(format!("Cannot reveal in Finder: {e}")))?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .args(["/select,", path])
        .spawn()
        .map_err(|e| AppError::Io(format!("Cannot open Explorer: {e}")))?;

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let parent = std::path::Path::new(path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string());
        std::process::Command::new("xdg-open")
            .arg(&parent)
            .spawn()
            .map_err(|e| AppError::Io(format!("Cannot open file manager: {e}")))?;
    }

    Ok(())
}
