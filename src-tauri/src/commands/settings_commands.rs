use crate::error::AppError;
use crate::AppState;

const ALLOWED_SETTINGS: &[&str] = &[
    "vault_timeout_minutes",
    "theme",
    "accent",
    "onboarding_complete",
    "terminal_font_size",
    "terminal_line_height",
    "terminal_scrollback",
    "terminal_copy_on_select",
    "terminal_font_family",
    "terminal_theme",
    "terminal_cursor_style",
];

#[tauri::command]
pub async fn get_setting(
    key: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<String>, AppError> {
    if !ALLOWED_SETTINGS.contains(&key.as_str()) {
        return Err(AppError::Validation(format!("unknown setting key: {key}")));
    }
    let val: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = ?")
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
    if !ALLOWED_SETTINGS.contains(&key.as_str()) {
        return Err(AppError::Validation(format!("unknown setting key: {key}")));
    }
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
