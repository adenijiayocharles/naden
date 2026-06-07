use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PlaybookStep {
    pub id: String,
    pub position: i64,
    pub command: String,
    pub delay_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PlaybookRow {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Frontend-facing DTO: a playbook with its ordered steps. Assembled in command
/// functions by joining playbook_steps; not derived from a single row.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Playbook {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub steps: Vec<PlaybookStep>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StepInput {
    pub command: String,
    pub delay_ms: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePlaybookPayload {
    pub title: String,
    pub description: Option<String>,
    pub steps: Vec<StepInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePlaybookPayload {
    pub title: String,
    pub description: Option<String>,
    pub steps: Vec<StepInput>,
}
