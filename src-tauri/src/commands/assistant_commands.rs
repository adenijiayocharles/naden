use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::Emitter;

use crate::assistant::{self, ChatMessage, Role};
use crate::error::AppError;
use crate::vault;
use crate::AppState;

// Active/selected provider (which key to use when sending).
const ACTIVE_PROVIDER_KEY: &str = "ai_assistant_active_provider";
// Per-provider vault credential IDs.
const OPENAI_KEY_ID_KEY: &str = "ai_assistant_openai_key_id";
const ANTHROPIC_KEY_ID_KEY: &str = "ai_assistant_anthropic_key_id";
// Shared toggles.
const ENABLED_KEY: &str = "ai_assistant_enabled";
const PERSIST_HISTORY_KEY: &str = "ai_assistant_persist_history";
// Legacy single-key settings — only read during migration; never written.
const LEGACY_PROVIDER_KEY: &str = "ai_assistant_provider";
const LEGACY_KEY_ID_KEY: &str = "ai_assistant_key_id";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantStatus {
    pub openai_configured: bool,
    pub anthropic_configured: bool,
    pub active_provider: Option<String>,
    pub enabled: bool,
    pub persist_history: bool,
}

async fn read_setting(db: &SqlitePool, key: &str) -> Result<Option<String>, AppError> {
    sqlx::query_scalar("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))
}

async fn write_setting(db: &SqlitePool, key: &str, value: &str) -> Result<(), AppError> {
    sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
        .bind(key)
        .bind(value)
        .execute(db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

async fn clear_setting(db: &SqlitePool, key: &str) -> Result<(), AppError> {
    sqlx::query("DELETE FROM settings WHERE key = ?")
        .bind(key)
        .execute(db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

fn key_id_setting(provider: &str) -> Result<&'static str, AppError> {
    match provider {
        "openai" => Ok(OPENAI_KEY_ID_KEY),
        "anthropic" => Ok(ANTHROPIC_KEY_ID_KEY),
        other => Err(AppError::Validation(format!("unknown assistant provider: {other}"))),
    }
}

/// One-time migration: if the old single-key settings exist, move the credential
/// to its provider-specific slot and set the active provider, then delete the
/// legacy keys so this only runs once.
async fn migrate_legacy_key(db: &SqlitePool) -> Result<(), AppError> {
    let legacy_key_id = read_setting(db, LEGACY_KEY_ID_KEY).await?;
    let legacy_provider = read_setting(db, LEGACY_PROVIDER_KEY).await?;

    if let (Some(key_id), Some(provider)) = (legacy_key_id, legacy_provider) {
        let dest = key_id_setting(&provider)?;
        write_setting(db, dest, &key_id).await?;
        // Only set the active provider if nothing is set yet.
        if read_setting(db, ACTIVE_PROVIDER_KEY).await?.is_none() {
            write_setting(db, ACTIVE_PROVIDER_KEY, &provider).await?;
        }
        clear_setting(db, LEGACY_KEY_ID_KEY).await?;
        clear_setting(db, LEGACY_PROVIDER_KEY).await?;
    }
    Ok(())
}

/// Stores the user's API key for `provider`, encrypted in the vault.
/// Each provider's key is independent — adding a second provider leaves the
/// first intact. The first key added becomes the default active provider.
#[tauri::command]
pub async fn set_assistant_api_key(
    provider: String,
    api_key: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    if api_key.trim().is_empty() {
        return Err(AppError::Validation("API key cannot be empty".into()));
    }
    let key_id_key = key_id_setting(&provider)?;

    let vault_key: [u8; 32] = {
        let guard = state.vault_key.lock().await;
        match guard.as_ref() {
            None => return Err(AppError::Vault("vault is locked".into())),
            Some(k) => **k,
        }
    };

    // Delete the old vault row for this provider before storing the new one.
    if let Some(old_id) = read_setting(&state.db, key_id_key).await? {
        vault::delete_credential(&state.db, &old_id).await?;
    }

    let id = vault::store_credential(&state.db, &vault_key, &api_key).await?;
    write_setting(&state.db, key_id_key, &id).await?;

    // First key added becomes the default active provider.
    if read_setting(&state.db, ACTIVE_PROVIDER_KEY).await?.is_none() {
        write_setting(&state.db, ACTIVE_PROVIDER_KEY, &provider).await?;
    }
    Ok(())
}

/// Removes the API key for a single provider. If that provider was active,
/// switches to the other if it's configured, otherwise disables the assistant.
#[tauri::command]
pub async fn clear_assistant_provider_key(
    provider: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let key_id_key = key_id_setting(&provider)?;

    if let Some(id) = read_setting(&state.db, key_id_key).await? {
        vault::delete_credential(&state.db, &id).await?;
    }
    clear_setting(&state.db, key_id_key).await?;

    let active = read_setting(&state.db, ACTIVE_PROVIDER_KEY).await?;
    if active.as_deref() == Some(provider.as_str()) {
        // Attempt to fall back to the other provider.
        let other = if provider == "openai" { "anthropic" } else { "openai" };
        let other_key_id = key_id_setting(other)?;
        if read_setting(&state.db, other_key_id).await?.is_some() {
            write_setting(&state.db, ACTIVE_PROVIDER_KEY, other).await?;
        } else {
            clear_setting(&state.db, ACTIVE_PROVIDER_KEY).await?;
            write_setting(&state.db, ENABLED_KEY, "false").await?;
        }
    }
    Ok(())
}

/// Changes which provider handles outgoing messages. Requires that provider's
/// key to already be configured.
#[tauri::command]
pub async fn switch_assistant_provider(
    provider: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let key_id_key = key_id_setting(&provider)?;
    if read_setting(&state.db, key_id_key).await?.is_none() {
        return Err(AppError::Validation(format!(
            "no API key configured for {provider}"
        )));
    }
    write_setting(&state.db, ACTIVE_PROVIDER_KEY, &provider).await
}

/// Removes all stored API keys and disables the assistant — the "reset
/// everything" path (currently unused by the UI but kept for completeness).
#[tauri::command]
pub async fn clear_assistant_api_key(state: tauri::State<'_, AppState>) -> Result<(), AppError> {
    for key_id_key in [OPENAI_KEY_ID_KEY, ANTHROPIC_KEY_ID_KEY] {
        if let Some(id) = read_setting(&state.db, key_id_key).await? {
            vault::delete_credential(&state.db, &id).await?;
        }
        clear_setting(&state.db, key_id_key).await?;
    }
    clear_setting(&state.db, ACTIVE_PROVIDER_KEY).await?;
    write_setting(&state.db, ENABLED_KEY, "false").await?;
    Ok(())
}

/// Flips the opt-in toggle without touching the stored keys.
#[tauri::command]
pub async fn set_assistant_enabled(
    enabled: bool,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    write_setting(&state.db, ENABLED_KEY, if enabled { "true" } else { "false" }).await
}

/// Reports configuration state for the settings UI — never exposes the keys.
#[tauri::command]
pub async fn get_assistant_status(
    state: tauri::State<'_, AppState>,
) -> Result<AssistantStatus, AppError> {
    migrate_legacy_key(&state.db).await?;

    let openai_configured = read_setting(&state.db, OPENAI_KEY_ID_KEY).await?.is_some();
    let anthropic_configured = read_setting(&state.db, ANTHROPIC_KEY_ID_KEY).await?.is_some();
    let active_provider = read_setting(&state.db, ACTIVE_PROVIDER_KEY).await?;
    let enabled = read_setting(&state.db, ENABLED_KEY)
        .await?
        .map(|v| v == "true")
        .unwrap_or(false);
    let persist_history = read_setting(&state.db, PERSIST_HISTORY_KEY)
        .await?
        .map(|v| v == "true")
        .unwrap_or(false);

    Ok(AssistantStatus {
        openai_configured,
        anthropic_configured,
        active_provider,
        enabled,
        persist_history,
    })
}

/// Deletes every archived conversation along with its encrypted vault row.
async fn purge_chat_archive(db: &SqlitePool) -> Result<(), AppError> {
    let rows: Vec<(String,)> = sqlx::query_as("SELECT credential_id FROM assistant_chat_archive")
        .fetch_all(db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    for (credential_id,) in rows {
        vault::delete_credential(db, &credential_id).await?;
    }

    sqlx::query("DELETE FROM assistant_chat_archive")
        .execute(db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

/// Flips the opt-in toggle for persisting chat transcripts. Turning it off
/// purges everything already archived.
#[tauri::command]
pub async fn set_assistant_persist_history(
    enabled: bool,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    if !enabled {
        purge_chat_archive(&state.db).await?;
    }
    write_setting(&state.db, PERSIST_HISTORY_KEY, if enabled { "true" } else { "false" }).await
}

/// Encrypts `payload` (the JSON-serialised per-server transcript) and upserts
/// it under `server_id`, replacing any prior archive for that server.
#[tauri::command]
pub async fn save_assistant_chat_history(
    server_id: String,
    payload: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let persist_enabled = read_setting(&state.db, PERSIST_HISTORY_KEY)
        .await?
        .map(|v| v == "true")
        .unwrap_or(false);
    if !persist_enabled {
        return Err(AppError::Validation(
            "chat history persistence is not enabled".into(),
        ));
    }

    let vault_key: [u8; 32] = {
        let guard = state.vault_key.lock().await;
        match guard.as_ref() {
            None => return Err(AppError::Vault("vault is locked".into())),
            Some(k) => **k,
        }
    };

    let existing: Option<(String,)> =
        sqlx::query_as("SELECT credential_id FROM assistant_chat_archive WHERE server_id = ?")
            .bind(&server_id)
            .fetch_optional(&state.db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

    let credential_id = vault::store_credential(&state.db, &vault_key, &payload).await?;

    sqlx::query(
        "INSERT INTO assistant_chat_archive (server_id, credential_id, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (server_id) DO UPDATE SET credential_id = excluded.credential_id, updated_at = excluded.updated_at",
    )
    .bind(&server_id)
    .bind(&credential_id)
    .bind(chrono::Utc::now().timestamp())
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    if let Some((old_credential_id,)) = existing {
        if old_credential_id != credential_id {
            vault::delete_credential(&state.db, &old_credential_id).await?;
        }
    }

    Ok(())
}

/// Returns the archived transcript JSON for `server_id`, or `None` if nothing
/// has been saved yet.
#[tauri::command]
pub async fn load_assistant_chat_history(
    server_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<String>, AppError> {
    let persist_enabled = read_setting(&state.db, PERSIST_HISTORY_KEY)
        .await?
        .map(|v| v == "true")
        .unwrap_or(false);
    if !persist_enabled {
        return Ok(None);
    }

    let row: Option<(String,)> =
        sqlx::query_as("SELECT credential_id FROM assistant_chat_archive WHERE server_id = ?")
            .bind(&server_id)
            .fetch_optional(&state.db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

    let Some((credential_id,)) = row else {
        return Ok(None);
    };

    let vault_key: [u8; 32] = {
        let guard = state.vault_key.lock().await;
        match guard.as_ref() {
            None => return Err(AppError::Vault("vault is locked".into())),
            Some(k) => **k,
        }
    };

    let payload = vault::retrieve_credential(&state.db, &vault_key, &credential_id).await?;
    Ok(Some(payload))
}

#[derive(Deserialize)]
pub struct AssistantChatMessage {
    pub role: String,
    pub content: String,
}

/// Sends a conversation to the active provider and streams the reply back as
/// `assistant:token:{requestId}` events, finishing with `assistant:done` or
/// `assistant:error`.
#[tauri::command]
pub async fn send_assistant_message(
    request_id: String,
    messages: Vec<AssistantChatMessage>,
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), AppError> {
    let enabled = read_setting(&state.db, ENABLED_KEY)
        .await?
        .map(|v| v == "true")
        .unwrap_or(false);
    if !enabled {
        return Err(AppError::Validation("AI assistant is not enabled".into()));
    }

    let provider_id = read_setting(&state.db, ACTIVE_PROVIDER_KEY)
        .await?
        .ok_or_else(|| AppError::Validation("no AI provider configured".into()))?;

    let key_id_setting = key_id_setting(&provider_id)?;
    let key_id = read_setting(&state.db, key_id_setting)
        .await?
        .ok_or_else(|| AppError::Validation(format!("no API key configured for {provider_id}")))?;

    let vault_key: [u8; 32] = {
        let guard = state.vault_key.lock().await;
        match guard.as_ref() {
            None => return Err(AppError::Vault("vault is locked".into())),
            Some(k) => **k,
        }
    };
    let api_key = vault::retrieve_credential(&state.db, &vault_key, &key_id).await?;
    let provider = assistant::provider_for(&provider_id)?;

    let chat_messages: Vec<ChatMessage> = messages
        .into_iter()
        .map(|m| ChatMessage {
            role: if m.role == "assistant" {
                Role::Assistant
            } else {
                Role::User
            },
            content: m.content,
        })
        .collect();

    tauri::async_runtime::spawn(async move {
        let token_event = format!("assistant:token:{request_id}");
        let mut on_token = |token: String| {
            let _ = app_handle.emit(&token_event, token);
        };

        match provider
            .stream_reply(&api_key, &chat_messages, &mut on_token)
            .await
        {
            Ok(()) => {
                let _ = app_handle.emit(&format!("assistant:done:{request_id}"), ());
            }
            Err(e) => {
                let _ = app_handle.emit(&format!("assistant:error:{request_id}"), e.to_string());
            }
        }
    });

    Ok(())
}
