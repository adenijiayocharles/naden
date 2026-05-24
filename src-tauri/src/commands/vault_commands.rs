use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::error::AppError;
use crate::vault::{self, master_password};
use crate::AppState;

// ── Lockout persistence ───────────────────────────────────────────────────────

/// Writes the current failure count and lockout expiry to the settings table
/// so the brute-force lockout survives app restarts.
pub(crate) async fn persist_lockout(
    db: &sqlx::SqlitePool,
    failures: u32,
    until: Option<SystemTime>,
) {
    let failures_str = failures.to_string();
    let until_str = until
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs().to_string())
        .unwrap_or_default();

    let _ = sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
        .bind("vault_lockout_failures")
        .bind(&failures_str)
        .execute(db)
        .await;

    let _ = sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
        .bind("vault_lockout_until")
        .bind(&until_str)
        .execute(db)
        .await;
}

/// Reads the persisted failure count and lockout expiry from the settings table.
/// Returns `(0, None)` on any parse or DB error, and clears a lockout that has
/// already expired so it is not presented to the user.
pub async fn load_lockout(db: &sqlx::SqlitePool) -> (u32, Option<SystemTime>) {
    let failures: u32 = sqlx::query_scalar::<_, String>(
        "SELECT value FROM settings WHERE key = 'vault_lockout_failures'",
    )
    .fetch_optional(db)
    .await
    .ok()
    .flatten()
    .and_then(|v| v.parse().ok())
    .unwrap_or(0);

    let until: Option<SystemTime> = sqlx::query_scalar::<_, String>(
        "SELECT value FROM settings WHERE key = 'vault_lockout_until'",
    )
    .fetch_optional(db)
    .await
    .ok()
    .flatten()
    .filter(|v| !v.is_empty())
    .and_then(|v| v.parse::<u64>().ok())
    .map(|secs| UNIX_EPOCH + Duration::from_secs(secs))
    // Discard if already in the past so stale rows don't lock out the user.
    .filter(|&t| t > SystemTime::now());

    (failures, until)
}

// ── Vault commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn vault_is_setup(state: tauri::State<'_, AppState>) -> Result<bool, AppError> {
    master_password::is_setup(&state.db).await
}

#[tauri::command]
pub async fn vault_setup(
    master_password: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    if master_password.len() < 8 {
        return Err(AppError::Validation(
            "master password must be at least 8 characters".into(),
        ));
    }
    let key = crate::vault::master_password::setup(&state.db, &master_password).await?;
    *state.vault_key.lock().await = Some(key);
    Ok(())
}

#[tauri::command]
pub async fn vault_unlock(
    master_password: String,
    state: tauri::State<'_, AppState>,
) -> Result<bool, AppError> {
    // Brute-force protection: check lockout before running the expensive KDF.
    {
        let mut failures = state.unlock_failures.lock().await;
        let (_count, lockout_until) = &mut *failures;

        if let Some(until) = *lockout_until {
            if SystemTime::now() < until {
                return Err(AppError::Vault(
                    "too many failed attempts — please wait before trying again".into(),
                ));
            }
            // Lockout window expired; reset so we can accept new attempts.
            *lockout_until = None;
        }
        // Release the lock before the slow PBKDF2 call.
        drop(failures);
    }

    match crate::vault::master_password::verify(&state.db, &master_password).await? {
        Some(key) => {
            *state.unlock_failures.lock().await = (0, None);
            persist_lockout(&state.db, 0, None).await;
            *state.vault_key.lock().await = Some(key);
            // Reset auto-lock timer on successful unlock
            *state.last_vault_activity.lock().await = std::time::Instant::now();
            Ok(true)
        }
        None => {
            let mut failures = state.unlock_failures.lock().await;
            let (count, lockout_until) = &mut *failures;
            *count += 1;
            // After 5 failures, apply exponential backoff: 30s × 2^(extra failures), max 1 h.
            if *count >= 5 {
                let extra = (*count - 5).min(7);
                let secs = 30u64 * (1u64 << extra);
                *lockout_until = Some(SystemTime::now() + Duration::from_secs(secs));
            }
            persist_lockout(&state.db, *count, *lockout_until).await;
            Ok(false)
        }
    }
}

#[tauri::command]
pub async fn vault_is_unlocked(state: tauri::State<'_, AppState>) -> Result<bool, AppError> {
    // When no master password is required the vault is always accessible,
    // but vault_key starts as None on each restart. Auto-unlock here so the
    // frontend never sees the locked state when password protection is off.
    if !master_password::is_password_required(&state.db).await? {
        let mut key = state.vault_key.lock().await;
        if key.is_none() {
            *key = Some(zeroize::Zeroizing::new([0u8; 32]));
        }
        return Ok(true);
    }
    Ok(state.vault_key.lock().await.is_some())
}

#[tauri::command]
pub async fn vault_lock(state: tauri::State<'_, AppState>) -> Result<(), AppError> {
    // Assigning None drops the Zeroizing<[u8;32]>, which scrubs the key bytes.
    *state.vault_key.lock().await = None;
    Ok(())
}

/// Stores `secret` in the OS keychain. Vault must be unlocked.
/// Returns a `vault_credential_id` to persist in the DB.
#[tauri::command]
pub async fn store_credential(
    secret: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, AppError> {
    if state.vault_key.lock().await.is_none() {
        return Err(AppError::Vault("vault is locked".into()));
    }
    vault::store_credential(&secret).await
}

/// Retrieves a secret from the OS keychain. Vault must be unlocked.
#[tauri::command]
pub async fn retrieve_credential(
    vault_credential_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, AppError> {
    if state.vault_key.lock().await.is_none() {
        return Err(AppError::Vault("vault is locked".into()));
    }
    vault::retrieve_credential(&vault_credential_id).await
}

#[tauri::command]
pub async fn vault_is_password_required(
    state: tauri::State<'_, AppState>,
) -> Result<bool, AppError> {
    master_password::is_password_required(&state.db).await
}

/// Disables vault password protection. Requires the current password to confirm.
#[tauri::command]
pub async fn vault_disable_password(
    current_password: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    // Apply the same brute-force lockout as vault_unlock so this command cannot
    // be used to bypass the rate limit on password verification.
    {
        let mut failures = state.unlock_failures.lock().await;
        let (_count, lockout_until) = &mut *failures;
        if let Some(until) = *lockout_until {
            if SystemTime::now() < until {
                return Err(AppError::Vault(
                    "too many failed attempts — please wait before trying again".into(),
                ));
            }
            *lockout_until = None;
        }
        drop(failures);
    }

    match master_password::verify(&state.db, &current_password).await? {
        None => {
            let mut failures = state.unlock_failures.lock().await;
            let (count, lockout_until) = &mut *failures;
            *count += 1;
            if *count >= 5 {
                let extra = (*count - 5).min(7);
                let secs = 30u64 * (1u64 << extra);
                *lockout_until = Some(SystemTime::now() + Duration::from_secs(secs));
            }
            return Err(AppError::Vault("incorrect password".into()));
        }
        Some(_) => {
            *state.unlock_failures.lock().await = (0, None);
        }
    }

    master_password::disable_password(&state.db).await?;
    // Ensure the vault stays unlocked with a placeholder key.
    let mut key_guard = state.vault_key.lock().await;
    if key_guard.is_none() {
        *key_guard = Some(zeroize::Zeroizing::new([0u8; 32]));
    }
    Ok(())
}

/// Permanently opts out of vault password protection without requiring a current password.
/// Only valid when no password has been set up yet (is_setup is false).
#[tauri::command]
pub async fn vault_skip_setup(state: tauri::State<'_, AppState>) -> Result<(), AppError> {
    if master_password::is_setup(&state.db).await? {
        return Err(AppError::Vault(
            "vault is already set up — use disable password to remove protection".into(),
        ));
    }
    master_password::set_password_required(&state.db, false).await?;
    *state.vault_key.lock().await = Some(zeroize::Zeroizing::new([0u8; 32]));
    Ok(())
}

/// Enables vault password protection and sets an initial master password.
#[tauri::command]
pub async fn vault_enable_password(
    new_password: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    if new_password.len() < 8 {
        return Err(AppError::Validation(
            "master password must be at least 8 characters".into(),
        ));
    }
    let key = master_password::setup(&state.db, &new_password).await?;
    master_password::set_password_required(&state.db, true).await?;
    *state.vault_key.lock().await = Some(key);
    Ok(())
}

/// Changes the master password. Requires the current password to confirm.
#[tauri::command]
pub async fn vault_change_password(
    current_password: String,
    new_password: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    if new_password.len() < 8 {
        return Err(AppError::Validation(
            "master password must be at least 8 characters".into(),
        ));
    }

    // Apply the same brute-force lockout as vault_unlock so this command cannot
    // be used to bypass the rate limit on password verification.
    {
        let mut failures = state.unlock_failures.lock().await;
        let (_count, lockout_until) = &mut *failures;
        if let Some(until) = *lockout_until {
            if SystemTime::now() < until {
                return Err(AppError::Vault(
                    "too many failed attempts — please wait before trying again".into(),
                ));
            }
            *lockout_until = None;
        }
        drop(failures);
    }

    match master_password::verify(&state.db, &current_password).await? {
        None => {
            let mut failures = state.unlock_failures.lock().await;
            let (count, lockout_until) = &mut *failures;
            *count += 1;
            if *count >= 5 {
                let extra = (*count - 5).min(7);
                let secs = 30u64 * (1u64 << extra);
                *lockout_until = Some(SystemTime::now() + Duration::from_secs(secs));
            }
            return Err(AppError::Vault("incorrect current password".into()));
        }
        Some(_) => {
            *state.unlock_failures.lock().await = (0, None);
        }
    }

    let key = master_password::setup(&state.db, &new_password).await?;
    *state.vault_key.lock().await = Some(key);
    Ok(())
}

/// Deletes a secret from the OS keychain. Vault must be unlocked.
#[tauri::command]
pub async fn delete_credential(
    vault_credential_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    if state.vault_key.lock().await.is_none() {
        return Err(AppError::Vault("vault is locked".into()));
    }
    vault::delete_credential(&vault_credential_id).await
}
