use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub id: String,
    pub server_id: Option<String>,
    pub server_display_name: String,
    pub hostname: String,
    pub port: i64,
    pub username: String,
    pub outcome: String,
    pub error_message: Option<String>,
    pub session_start: String,
    pub session_end: Option<String>,
    pub created_at: String,
}
