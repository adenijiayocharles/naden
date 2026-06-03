use serde::{Deserialize, Serialize};

use crate::error::AppError;

const VALID_FORWARD_TYPES: &[&str] = &["local", "remote", "dynamic"];

/// Validates the domain-level rules for a port forward regardless of whether
/// it is being created or updated. Lives here rather than in the query layer
/// so it can be tested without a database connection.
pub fn validate(
    forward_type: &str,
    local_port: i64,
    remote_host: &str,
    remote_port: i64,
) -> Result<(), AppError> {
    if !VALID_FORWARD_TYPES.contains(&forward_type) {
        return Err(AppError::Validation(
            "forward_type must be 'local', 'remote', or 'dynamic'".into(),
        ));
    }
    if !(1..=65535).contains(&local_port) {
        return Err(AppError::Validation(
            "local_port must be between 1 and 65535".into(),
        ));
    }
    if forward_type != "dynamic" {
        if remote_host.is_empty() {
            return Err(AppError::Validation(
                "remote_host is required for local and remote forwards".into(),
            ));
        }
        if remote_host.len() > 253
            || !remote_host
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || ".-_:[]%".contains(c))
        {
            return Err(AppError::Validation(
                "remote_host contains invalid characters".into(),
            ));
        }
        if !(1..=65535).contains(&remote_port) {
            return Err(AppError::Validation(
                "remote_port must be between 1 and 65535".into(),
            ));
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PortForward {
    pub id: String,
    pub server_id: String,
    pub label: String,
    pub forward_type: String, // "local" | "remote" | "dynamic"
    pub local_port: i64,
    pub remote_host: String,
    pub remote_port: i64,
    pub auto_start: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Fields shared between create and update operations.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortForwardFields {
    pub label: String,
    pub forward_type: String,
    pub local_port: i64,
    pub remote_host: String,
    pub remote_port: i64,
    pub auto_start: bool,
}

/// Payload for creating a new forward — server_id is required at creation time.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePortForwardPayload {
    pub server_id: String,
    #[serde(flatten)]
    pub fields: PortForwardFields,
}

/// Payload for updating an existing forward — server_id is fixed, only fields change.
pub type UpdatePortForwardPayload = PortForwardFields;
