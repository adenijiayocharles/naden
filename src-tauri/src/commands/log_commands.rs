use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::log_entry::LogEntry;
use crate::AppState;

// ── DB helpers (pub so ssh_commands can call them) ────────────────────────────

pub struct NewLogEntry<'a> {
    pub server_id: Option<&'a str>,
    pub server_display_name: &'a str,
    pub hostname: &'a str,
    pub port: i64,
    pub username: &'a str,
}

/// Insert a new row into the log with outcome = 'connecting'. Returns the new id.
pub async fn insert_log_entry(
    db: &SqlitePool,
    entry: &NewLogEntry<'_>,
) -> Result<String, AppError> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO audit_log
         (id, server_id, server_display_name, hostname, port, username,
          outcome, session_start, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'connecting', ?, ?)",
    )
    .bind(&id)
    .bind(entry.server_id)
    .bind(entry.server_display_name)
    .bind(entry.hostname)
    .bind(entry.port)
    .bind(entry.username)
    .bind(&now)
    .bind(&now)
    .execute(db)
    .await?;

    Ok(id)
}

/// Update a log row when the session closes.
pub async fn close_log_entry(
    db: &SqlitePool,
    log_id: &str,
    outcome: &str,
    error_message: Option<String>,
    session_end: &str,
) -> Result<(), AppError> {
    sqlx::query(
        "UPDATE audit_log
         SET outcome = ?, error_message = ?, session_end = ?
         WHERE id = ?",
    )
    .bind(outcome)
    .bind(error_message)
    .bind(session_end)
    .bind(log_id)
    .execute(db)
    .await?;
    Ok(())
}

// ── helpers ───────────────────────────────────────────────────────────────────

const LOG_FILTER_SQL: &str = "SELECT * FROM audit_log
     WHERE (? IS NULL OR server_id = ?)
       AND (? IS NULL OR session_start >= ?)
       AND (? IS NULL OR session_start <= ?)
     ORDER BY session_start DESC";

async fn query_log_entries(
    db: &SqlitePool,
    server_id: &Option<String>,
    start_date: &Option<String>,
    end_ts: &Option<String>,
    limit_offset: Option<(i64, i64)>,
) -> Result<Vec<LogEntry>, AppError> {
    if let Some((limit, offset)) = limit_offset {
        Ok(
            sqlx::query_as::<_, LogEntry>(&format!("{LOG_FILTER_SQL} LIMIT ? OFFSET ?"))
                .bind(server_id)
                .bind(server_id)
                .bind(start_date)
                .bind(start_date)
                .bind(end_ts)
                .bind(end_ts)
                .bind(limit)
                .bind(offset)
                .fetch_all(db)
                .await?,
        )
    } else {
        Ok(sqlx::query_as::<_, LogEntry>(LOG_FILTER_SQL)
            .bind(server_id)
            .bind(server_id)
            .bind(start_date)
            .bind(start_date)
            .bind(end_ts)
            .bind(end_ts)
            .fetch_all(db)
            .await?)
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_logs(
    offset: i64,
    limit: i64,
    server_id: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<LogEntry>, AppError> {
    let end_ts = end_date.as_deref().map(|d| format!("{d}T23:59:59"));
    query_log_entries(
        &state.db,
        &server_id,
        &start_date,
        &end_ts,
        Some((limit, offset)),
    )
    .await
}

#[tauri::command]
pub async fn export_logs_csv(
    server_id: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<String, AppError> {
    let end_ts = end_date.as_deref().map(|d| format!("{d}T23:59:59"));
    let entries = query_log_entries(&state.db, &server_id, &start_date, &end_ts, None).await?;

    let mut csv = String::from("Time,Server,Host,Port,Username,Outcome,Duration (s),Error\n");

    for e in &entries {
        let duration_secs = match (&e.session_start, &e.session_end) {
            (start, Some(end)) => {
                let s = chrono::DateTime::parse_from_rfc3339(start).ok();
                let en = chrono::DateTime::parse_from_rfc3339(end).ok();
                match (s, en) {
                    (Some(s), Some(en)) => (en - s).num_seconds().to_string(),
                    _ => String::new(),
                }
            }
            _ => String::new(),
        };

        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{}\n",
            csv_escape(&e.session_start),
            csv_escape(&e.server_display_name),
            csv_escape(&e.hostname),
            e.port,
            csv_escape(&e.username),
            csv_escape(&e.outcome),
            duration_secs,
            csv_escape(e.error_message.as_deref().unwrap_or("")),
        ));
    }

    Ok(csv)
}

#[tauri::command]
pub async fn clear_logs(state: tauri::State<'_, AppState>) -> Result<(), AppError> {
    sqlx::query("DELETE FROM audit_log")
        .execute(&state.db)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn get_last_connected_map(
    state: tauri::State<'_, AppState>,
) -> Result<std::collections::HashMap<String, String>, AppError> {
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT server_id, MAX(session_start) FROM audit_log
         WHERE server_id IS NOT NULL
         GROUP BY server_id",
    )
    .fetch_all(&state.db)
    .await?;

    Ok(rows.into_iter().collect())
}

fn csv_escape(s: &str) -> String {
    if s.contains([',', '"', '\n']) {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}
