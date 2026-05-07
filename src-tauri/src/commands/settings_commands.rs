use crate::error::AppError;
use crate::AppState;

#[tauri::command]
pub async fn get_setting(
    key: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<String>, AppError> {
    let val: Option<String> =
        sqlx::query_scalar("SELECT value FROM settings WHERE key = ?")
            .bind(&key)
            .fetch_optional(&state.db)
            .await?;
    Ok(val)
}

#[tauri::command]
pub async fn set_setting(
    key: String,
    value: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
        .bind(&key)
        .bind(&value)
        .execute(&state.db)
        .await?;
    Ok(())
}

/// Called by the frontend on user activity to reset the auto-lock timer.
#[tauri::command]
pub async fn vault_heartbeat(state: tauri::State<'_, AppState>) -> Result<(), AppError> {
    *state.last_vault_activity.lock().await = std::time::Instant::now();
    Ok(())
}
