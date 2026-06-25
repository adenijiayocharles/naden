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
    pub is_jump_host: bool,
    pub jump_host_id: Option<String>,
    pub is_favourite: bool,
    pub initial_dir: Option<String>,
    pub env_vars: Option<String>,
    pub pre_connect_hook: Option<String>,
    pub post_disconnect_hook: Option<String>,
    pub terminal_theme: Option<String>,
    /// Snapshot of the hook text last explicitly confirmed by the user.
    /// Written only by `queries::confirm_server_hooks_db` — deliberately
    /// absent from `CreateServerPayload`/`UpdateServerPayload` so no IPC
    /// caller can set a hook and its own "confirmed" snapshot in the same
    /// call (the same class of bug as the `vault_credential_id` IDOR).
    pub pre_connect_hook_confirmed: Option<String>,
    pub post_disconnect_hook_confirmed: Option<String>,
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

/// Frontend-facing DTO: all Server fields flattened alongside the tag list and group name.
/// Assembled in query functions; not derived from a single row.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerWithTags {
    #[serde(flatten)]
    pub server: Server,
    pub tags: Vec<Tag>,
    pub group_name: Option<String>,
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
    pub is_jump_host: Option<bool>,
    pub jump_host_id: Option<String>,
    pub initial_dir: Option<String>,
    pub env_vars: Option<String>,
    pub pre_connect_hook: Option<String>,
    pub post_disconnect_hook: Option<String>,
    pub terminal_theme: Option<String>,
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
    pub is_jump_host: Option<bool>,
    pub jump_host_id: Option<String>,
    pub is_favourite: Option<bool>,
    pub initial_dir: Option<String>,
    pub env_vars: Option<String>,
    pub pre_connect_hook: Option<String>,
    pub post_disconnect_hook: Option<String>,
    pub terminal_theme: Option<String>,
    /// When Some, replaces the full tag list. Some(vec![]) clears all tags.
    pub tag_ids: Option<Vec<String>>,
}
