use std::sync::{atomic::Ordering, Arc};

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
const OPENROUTER_KEY_ID_KEY: &str = "ai_assistant_openrouter_key_id";
// Shared toggles.
const ENABLED_KEY: &str = "ai_assistant_enabled";
const PERSIST_HISTORY_KEY: &str = "ai_assistant_persist_history";
// Sentinel written after first migration so the check is a single read.
const MIGRATED_KEY: &str = "ai_assistant_migrated";
// Legacy single-key settings — only read during migration; never written.
const LEGACY_PROVIDER_KEY: &str = "ai_assistant_provider";
const LEGACY_KEY_ID_KEY: &str = "ai_assistant_key_id";

// Hard limits for send_assistant_message.
const MAX_MESSAGES: usize = 200;
const MAX_TOTAL_CONTENT_BYTES: usize = 200_000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantStatus {
    pub openai_configured: bool,
    pub anthropic_configured: bool,
    pub openrouter_configured: bool,
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
        "openrouter" => Ok(OPENROUTER_KEY_ID_KEY),
        other => Err(AppError::Validation(format!(
            "unknown assistant provider: {other}"
        ))),
    }
}

/// One-time migration: if the old single-key settings exist, move the credential
/// to its provider-specific slot and set the active provider, then delete the
/// legacy keys. Guarded by a sentinel so subsequent calls cost a single read.
/// All writes are inside a transaction so a crash leaves state consistent and
/// migration retries cleanly on next launch.
async fn migrate_legacy_key(db: &SqlitePool) -> Result<(), AppError> {
    // Fast path — sentinel present means migration already completed.
    if read_setting(db, MIGRATED_KEY).await?.is_some() {
        return Ok(());
    }

    let legacy_key_id = read_setting(db, LEGACY_KEY_ID_KEY).await?;
    let legacy_provider = read_setting(db, LEGACY_PROVIDER_KEY).await?;

    let mut tx = db
        .begin()
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    if let (Some(key_id), Some(provider)) = (legacy_key_id, legacy_provider) {
        let dest = key_id_setting(&provider)?;
        sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
            .bind(dest)
            .bind(&key_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        let has_active: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM settings WHERE key = ?")
            .bind(ACTIVE_PROVIDER_KEY)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        if has_active == 0 {
            sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
                .bind(ACTIVE_PROVIDER_KEY)
                .bind(&provider)
                .execute(&mut *tx)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;
        }

        sqlx::query("DELETE FROM settings WHERE key = ? OR key = ?")
            .bind(LEGACY_KEY_ID_KEY)
            .bind(LEGACY_PROVIDER_KEY)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    // Sentinel inside the transaction — if commit fails, migration retries next open.
    sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
        .bind(MIGRATED_KEY)
        .bind("1")
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    tx.commit()
        .await
        .map_err(|e| AppError::Database(e.to_string()))
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

    let vault_key = {
        let guard = state.vault_key.lock().await;
        match guard.as_ref() {
            None => return Err(AppError::Vault("vault is locked".into())),
            Some(k) => zeroize::Zeroizing::new(**k),
        }
    };

    // Delete the old vault row for this provider before storing the new one.
    if let Some(old_id) = read_setting(&state.db, key_id_key).await? {
        vault::delete_credential(&state.db, &old_id).await?;
    }

    let id = vault::store_credential(&state.db, &*vault_key,&api_key).await?;
    write_setting(&state.db, key_id_key, &id).await?;

    // First key added becomes the default active provider.
    if read_setting(&state.db, ACTIVE_PROVIDER_KEY)
        .await?
        .is_none()
    {
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
        // Find the first remaining configured provider to fall back to.
        const ALL: &[(&str, &str)] = &[
            ("openai", OPENAI_KEY_ID_KEY),
            ("anthropic", ANTHROPIC_KEY_ID_KEY),
            ("openrouter", OPENROUTER_KEY_ID_KEY),
        ];
        let mut fallback: Option<&str> = None;
        for &(pid, key_id_key) in ALL {
            if pid == provider.as_str() {
                continue;
            }
            if read_setting(&state.db, key_id_key).await?.is_some() {
                fallback = Some(pid);
                break;
            }
        }
        if let Some(other) = fallback {
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
    for key_id_key in [OPENAI_KEY_ID_KEY, ANTHROPIC_KEY_ID_KEY, OPENROUTER_KEY_ID_KEY] {
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
    write_setting(
        &state.db,
        ENABLED_KEY,
        if enabled { "true" } else { "false" },
    )
    .await
}

/// Reports configuration state for the settings UI — never exposes the keys.
#[tauri::command]
pub async fn get_assistant_status(
    state: tauri::State<'_, AppState>,
) -> Result<AssistantStatus, AppError> {
    migrate_legacy_key(&state.db).await?;

    let openai_configured = read_setting(&state.db, OPENAI_KEY_ID_KEY).await?.is_some();
    let anthropic_configured = read_setting(&state.db, ANTHROPIC_KEY_ID_KEY)
        .await?
        .is_some();
    let openrouter_configured = read_setting(&state.db, OPENROUTER_KEY_ID_KEY)
        .await?
        .is_some();
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
        openrouter_configured,
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
    write_setting(
        &state.db,
        PERSIST_HISTORY_KEY,
        if enabled { "true" } else { "false" },
    )
    .await
}

/// Encrypts `payload` (the JSON-serialised per-server transcript) and saves it
/// under `server_id`. On subsequent calls the credential is updated in place so
/// the archive pointer never changes and there is no window for orphaned rows.
#[tauri::command]
pub async fn save_assistant_chat_history(
    server_id: String,
    payload: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    // Reject arbitrary server_id strings — prevents vault oracle abuse from a
    // compromised webview that can call IPC commands.
    let server_exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM servers WHERE id = ?")
        .bind(&server_id)
        .fetch_one(&state.db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    if server_exists == 0 {
        return Err(AppError::Validation("unknown server".into()));
    }

    let persist_enabled = read_setting(&state.db, PERSIST_HISTORY_KEY)
        .await?
        .map(|v| v == "true")
        .unwrap_or(false);
    if !persist_enabled {
        return Err(AppError::Validation(
            "chat history persistence is not enabled".into(),
        ));
    }

    let vault_key = {
        let guard = state.vault_key.lock().await;
        match guard.as_ref() {
            None => return Err(AppError::Vault("vault is locked".into())),
            Some(k) => zeroize::Zeroizing::new(**k),
        }
    };

    let existing: Option<String> =
        sqlx::query_scalar("SELECT credential_id FROM assistant_chat_archive WHERE server_id = ?")
            .bind(&server_id)
            .fetch_optional(&state.db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

    if let Some(credential_id) = existing {
        // Update ciphertext in place — same ID, new nonce, zero orphan risk.
        vault::update_credential(&state.db, &*vault_key,&credential_id, &payload).await?;
        sqlx::query("UPDATE assistant_chat_archive SET updated_at = ? WHERE server_id = ?")
            .bind(chrono::Utc::now().timestamp())
            .bind(&server_id)
            .execute(&state.db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
    } else {
        let credential_id = vault::store_credential(&state.db, &*vault_key,&payload).await?;
        sqlx::query(
            "INSERT INTO assistant_chat_archive (server_id, credential_id, updated_at) VALUES (?, ?, ?)",
        )
        .bind(&server_id)
        .bind(&credential_id)
        .bind(chrono::Utc::now().timestamp())
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
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
    let server_exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM servers WHERE id = ?")
        .bind(&server_id)
        .fetch_one(&state.db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    if server_exists == 0 {
        return Err(AppError::Validation("unknown server".into()));
    }

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

    let vault_key = {
        let guard = state.vault_key.lock().await;
        match guard.as_ref() {
            None => return Err(AppError::Vault("vault is locked".into())),
            Some(k) => zeroize::Zeroizing::new(**k),
        }
    };

    let payload = vault::retrieve_credential(&state.db, &*vault_key,&credential_id).await?;
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

    let vault_key = {
        let guard = state.vault_key.lock().await;
        match guard.as_ref() {
            None => return Err(AppError::Vault("vault is locked".into())),
            Some(k) => zeroize::Zeroizing::new(**k),
        }
    };
    let api_key =
        zeroize::Zeroizing::new(vault::retrieve_credential(&state.db, &*vault_key,&key_id).await?);
    let provider = assistant::provider_for(&provider_id)?;
    let http_client = state.http_client.clone();
    if state.assistant_in_flight.swap(true, Ordering::AcqRel) {
        return Err(AppError::Validation("assistant request already in progress".into()));
    }
    let in_flight = Arc::clone(&state.assistant_in_flight);

    if messages.len() > MAX_MESSAGES {
        return Err(AppError::Validation(format!(
            "message count exceeds limit ({MAX_MESSAGES})"
        )));
    }
    let total_bytes: usize = messages.iter().map(|m| m.content.len()).sum();
    if total_bytes > MAX_TOTAL_CONTENT_BYTES {
        return Err(AppError::Validation("message content too large".into()));
    }

    let chat_messages: Vec<ChatMessage> = messages
        .into_iter()
        .map(|m| {
            let role = match m.role.as_str() {
                "assistant" => Ok(Role::Assistant),
                "user" => Ok(Role::User),
                other => Err(AppError::Validation(format!("invalid role: {other}"))),
            }?;
            Ok(ChatMessage {
                role,
                content: m.content,
            })
        })
        .collect::<Result<Vec<_>, AppError>>()?;

    tauri::async_runtime::spawn(async move {
        let token_event = format!("assistant:token:{request_id}");
        let mut on_token = |token: String| {
            let _ = app_handle.emit(&token_event, token);
        };

        match provider
            .stream_reply(&http_client, &api_key, &chat_messages, &mut on_token)
            .await
        {
            Ok(()) => {
                in_flight.store(false, Ordering::Release);
                let _ = app_handle.emit(&format!("assistant:done:{request_id}"), ());
            }
            // `Validation` messages here are ones we constructed ourselves
            // from HTTP status codes (see `provider_error`) and are safe to
            // show verbatim. Other variants may wrap raw provider/network
            // errors, so they're logged only and replaced with a generic
            // message before reaching the frontend.
            Err(AppError::Validation(message)) => {
                in_flight.store(false, Ordering::Release);
                log::error!("[assistant] stream error for {request_id}: {message}");
                let _ = app_handle.emit(&format!("assistant:error:{request_id}"), message);
            }
            Err(e) => {
                in_flight.store(false, Ordering::Release);
                log::error!("[assistant] stream error for {request_id}: {e}");
                let _ = app_handle.emit(
                    &format!("assistant:error:{request_id}"),
                    "provider request failed",
                );
            }
        }
    });

    Ok(())
}
