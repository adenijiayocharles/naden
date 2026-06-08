use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::Emitter;

use crate::assistant::{self, ChatMessage, Role};
use crate::error::AppError;
use crate::vault;
use crate::AppState;

const PROVIDER_KEY: &str = "ai_assistant_provider";
const KEY_ID_KEY: &str = "ai_assistant_key_id";
const ENABLED_KEY: &str = "ai_assistant_enabled";
const PERSIST_HISTORY_KEY: &str = "ai_assistant_persist_history";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantStatus {
    pub configured: bool,
    pub provider: Option<String>,
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

/// Stores the user's own API key for `provider`, encrypted at rest through the
/// vault — the same AES-256-GCM path as SSH credentials. Replaces any
/// previously stored key (the old vault row is deleted, not just orphaned).
/// Requires the vault to be unlocked; the key never round-trips back to the
/// frontend once set — only `get_assistant_status` is exposed for that.
#[tauri::command]
pub async fn set_assistant_api_key(
    provider: String,
    api_key: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    if api_key.trim().is_empty() {
        return Err(AppError::Validation("API key cannot be empty".into()));
    }

    let key: [u8; 32] = {
        let guard = state.vault_key.lock().await;
        match guard.as_ref() {
            None => return Err(AppError::Vault("vault is locked".into())),
            Some(k) => **k,
        }
    };

    if let Some(old_id) = read_setting(&state.db, KEY_ID_KEY).await? {
        vault::delete_credential(&state.db, &old_id).await?;
    }

    let id = vault::store_credential(&state.db, &key, &api_key).await?;
    write_setting(&state.db, KEY_ID_KEY, &id).await?;
    write_setting(&state.db, PROVIDER_KEY, &provider).await?;
    Ok(())
}

/// Removes the stored key entirely and turns the assistant back off — the
/// "forget my key" action in settings.
#[tauri::command]
pub async fn clear_assistant_api_key(state: tauri::State<'_, AppState>) -> Result<(), AppError> {
    if let Some(id) = read_setting(&state.db, KEY_ID_KEY).await? {
        vault::delete_credential(&state.db, &id).await?;
    }
    clear_setting(&state.db, KEY_ID_KEY).await?;
    clear_setting(&state.db, PROVIDER_KEY).await?;
    write_setting(&state.db, ENABLED_KEY, "false").await?;
    Ok(())
}

/// Flips the opt-in toggle without touching the stored key.
#[tauri::command]
pub async fn set_assistant_enabled(
    enabled: bool,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    write_setting(&state.db, ENABLED_KEY, if enabled { "true" } else { "false" }).await
}

/// Reports configuration state for the settings UI without ever exposing the
/// key itself — `configured` is derived from whether a vault row exists.
#[tauri::command]
pub async fn get_assistant_status(
    state: tauri::State<'_, AppState>,
) -> Result<AssistantStatus, AppError> {
    let key_id = read_setting(&state.db, KEY_ID_KEY).await?;
    let provider = read_setting(&state.db, PROVIDER_KEY).await?;
    let enabled = read_setting(&state.db, ENABLED_KEY)
        .await?
        .map(|v| v == "true")
        .unwrap_or(false);
    let persist_history = read_setting(&state.db, PERSIST_HISTORY_KEY)
        .await?
        .map(|v| v == "true")
        .unwrap_or(false);

    Ok(AssistantStatus {
        configured: key_id.is_some(),
        provider,
        enabled,
        persist_history,
    })
}

/// Deletes every archived conversation along with its encrypted vault row —
/// the cleanup run when the user opts back out of persistence.
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

/// Flips the opt-in toggle for persisting chat transcripts to disk. Turning it
/// off purges everything already archived — "optional" should mean nothing
/// lingers once the user opts back out, not just that future turns stop saving.
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

/// Encrypts `payload` (the JSON-serialised per-server transcript) through the
/// vault — same AES-256-GCM path as SSH credentials and the assistant's own
/// API key — and upserts it under `server_id`. Replaces any prior archive for
/// that server so old ciphertext doesn't linger once superseded.
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
        return Err(AppError::Validation("chat history persistence is not enabled".into()));
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

/// Returns the archived transcript JSON for `server_id`, or `None` when
/// nothing has been saved yet. Requires the vault to be unlocked, same as any
/// other encrypted read.
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

/// Sends a conversation to the configured provider and streams the reply back
/// as `assistant:token:{requestId}` events (one per chunk), finishing with
/// either `assistant:done:{requestId}` or `assistant:error:{requestId}` —
/// mirroring how PTY activity streams through `terminal:output/status/error`.
/// Returns as soon as the request is dispatched; the reply arrives over events.
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

    let provider_id = read_setting(&state.db, PROVIDER_KEY)
        .await?
        .ok_or_else(|| AppError::Validation("no AI provider configured".into()))?;
    let key_id = read_setting(&state.db, KEY_ID_KEY)
        .await?
        .ok_or_else(|| AppError::Validation("no API key configured".into()))?;

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
            role: if m.role == "assistant" { Role::Assistant } else { Role::User },
            content: m.content,
        })
        .collect();

    tauri::async_runtime::spawn(async move {
        let token_event = format!("assistant:token:{request_id}");
        let mut on_token = |token: String| {
            let _ = app_handle.emit(&token_event, token);
        };

        match provider.stream_reply(&api_key, &chat_messages, &mut on_token).await {
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
