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
    pub is_favourite: bool,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateServerPayload {
    pub display_name: String,
    pub hostname: String,
    pub port: Option<i64>,
    pub username: Option<String>,
    pub auth_method: Option<String>,
    pub identity_file_path: Option<String>,
    pub vault_credential_id: Option<String>,
    pub group_id: Option<String>,
    pub notes: Option<String>,
    pub is_jump_host: Option<bool>,
    pub jump_host_id: Option<String>,
    pub tag_ids: Option<Vec<String>>,
}

/// All fields optional — only supplied fields are applied; None means "leave unchanged".
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateServerPayload {
    pub display_name: Option<String>,
    pub hostname: Option<String>,
    pub port: Option<i64>,
    pub username: Option<String>,
    pub auth_method: Option<String>,
    pub identity_file_path: Option<String>,
    pub vault_credential_id: Option<String>,
    pub group_id: Option<String>,
    pub notes: Option<String>,
    pub is_jump_host: Option<bool>,
    pub jump_host_id: Option<String>,
    pub is_favourite: Option<bool>,
    /// When Some, replaces the full tag list. Some(vec![]) clears all tags.
    pub tag_ids: Option<Vec<String>>,
}
