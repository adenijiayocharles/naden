use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SessionLog {
    pub id: String,
    pub server_id: Option<String>,
    pub server_display_name: String,
    pub file_path: String,
    pub start_time: String,
    pub end_time: Option<String>,
    pub file_size_bytes: Option<i64>,
    pub created_at: String,
}
