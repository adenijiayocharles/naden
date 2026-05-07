use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::audit_entry::AuditEntry;
use crate::AppState;

// ── DB helpers (pub so ssh_commands can call them) ────────────────────────────

pub struct NewAuditEntry<'a> {
    pub server_id: Option<&'a str>,
    pub server_display_name: &'a str,
    pub hostname: &'a str,
    pub port: i64,
    pub username: &'a str,
}

/// Insert a new audit_log row with outcome = 'connecting'. Returns the new id.
pub async fn insert_audit_entry(
    db: &SqlitePool,
    entry: &NewAuditEntry<'_>,
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

/// Update an audit row when the session closes.
pub async fn close_audit_entry(
    db: &SqlitePool,
    audit_id: &str,
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
    .bind(audit_id)
    .execute(db)
    .await?;
    Ok(())
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_audit_log(
    offset: i64,
    limit: i64,
    server_id: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<AuditEntry>, AppError> {
    // Append T23:59:59 so the end date is inclusive for the whole day
    let end_ts = end_date.as_deref().map(|d| format!("{d}T23:59:59"));

    let entries = sqlx::query_as::<_, AuditEntry>(
        "SELECT * FROM audit_log
         WHERE (? IS NULL OR server_id = ?)
           AND (? IS NULL OR session_start >= ?)
           AND (? IS NULL OR session_start <= ?)
         ORDER BY session_start DESC
         LIMIT ? OFFSET ?",
    )
    .bind(&server_id)
    .bind(&server_id)
    .bind(&start_date)
    .bind(&start_date)
    .bind(&end_ts)
    .bind(&end_ts)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await?;

    Ok(entries)
}

#[tauri::command]
pub async fn export_audit_csv(
    server_id: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<String, AppError> {
    let end_ts = end_date.as_deref().map(|d| format!("{d}T23:59:59"));

    let entries = sqlx::query_as::<_, AuditEntry>(
        "SELECT * FROM audit_log
         WHERE (? IS NULL OR server_id = ?)
           AND (? IS NULL OR session_start >= ?)
           AND (? IS NULL OR session_start <= ?)
         ORDER BY session_start DESC",
    )
    .bind(&server_id)
    .bind(&server_id)
    .bind(&start_date)
    .bind(&start_date)
    .bind(&end_ts)
    .bind(&end_ts)
    .fetch_all(&state.db)
    .await?;

    let mut csv = String::from(
        "Time,Server,Host,Port,Username,Outcome,Duration (s),Error\n",
    );

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

fn csv_escape(s: &str) -> String {
    if s.contains([',', '"', '\n']) {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}
