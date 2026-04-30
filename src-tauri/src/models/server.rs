use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Server {
    pub id: String,
    pub display_name: String,
    pub hostname: String,
    pub port: i64,
    pub username: String,
    pub auth_method: String,
    pub identity_file_path: Option<String>,
    pub vault_credential_id: Option<String>,
    pub group_id: Option<String>,
    pub notes: Option<String>,
    pub is_jump_host: bool,
    pub jump_host_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Group {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub name: String,
}

/// Frontend-facing DTO: all Server fields flattened alongside the tag list.
/// Assembled in query functions by joining server_tags; not derived from a single row.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerWithTags {
    #[serde(flatten)]
    pub server: Server,
    pub tags: Vec<Tag>,
}
