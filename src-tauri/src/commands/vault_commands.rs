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
    let master_password = zeroize::Zeroizing::new(master_password);
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
    let master_password = zeroize::Zeroizing::new(master_password);

    // When password protection is disabled, any unlock call resets the manual lock.
    if !master_password::is_password_required(&state.db).await? {
        *state.manually_locked.lock().await = false;
        *state.vault_key.lock().await = Some(zeroize::Zeroizing::new([0u8; 32]));
        return Ok(true);
    }

    // Hold the mutex for the entire check-and-verify sequence to prevent the
    // TOCTOU race where two concurrent callers both see count < 5, drop the
    // guard, and then both proceed to the expensive KDF call simultaneously.
    let mut failures = state.unlock_failures.lock().await;

    if let Some(until) = failures.1 {
        if SystemTime::now() < until {
            return Err(AppError::Vault(
                "too many failed attempts — please wait before trying again".into(),
            ));
        }
        failures.1 = None;
    }

    match crate::vault::master_password::verify(&state.db, &master_password).await? {
        Some(key) => {
            *failures = (0, None);
            drop(failures);
            persist_lockout(&state.db, 0, None).await;
            *state.manually_locked.lock().await = false;
            *state.vault_key.lock().await = Some(key);
            *state.last_vault_activity.lock().await = std::time::Instant::now();
            Ok(true)
        }
        None => {
            failures.0 += 1;
            // After 5 failures, apply exponential backoff: 30s × 2^(extra failures), max 1 h.
            if failures.0 >= 5 {
                let extra = (failures.0 - 5).min(7);
                let secs = 30u64 * (1u64 << extra);
                failures.1 = Some(SystemTime::now() + Duration::from_secs(secs));
            }
            let count = failures.0;
            let until = failures.1;
            drop(failures);
            persist_lockout(&state.db, count, until).await;
            Ok(false)
        }
    }
}

#[tauri::command]
pub async fn vault_is_unlocked(state: tauri::State<'_, AppState>) -> Result<bool, AppError> {
    // When no master password is required the vault is always accessible,
    // but vault_key starts as None on each restart. Auto-unlock here on
    // cold-start, but respect an explicit vault_lock call.
    if !master_password::is_password_required(&state.db).await? {
        if *state.manually_locked.lock().await {
            return Ok(false);
        }
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
    // Record the explicit lock so vault_is_unlocked does not auto-restore the key
    // during the next heartbeat when password protection is disabled.
    *state.manually_locked.lock().await = true;
    // Assigning None drops the Zeroizing<[u8;32]>, which scrubs the key bytes.
    *state.vault_key.lock().await = None;
    Ok(())
}

/// Encrypts `secret` with the current vault key and stores it in the DB.
/// Returns a `vault_credential_id` to persist in the DB.
#[tauri::command]
pub async fn store_credential(
    secret: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, AppError> {
    let key: [u8; 32] = {
        let guard = state.vault_key.lock().await;
        match guard.as_ref() {
            None => return Err(AppError::Vault("vault is locked".into())),
            Some(k) => **k,
        }
    };
    vault::store_credential(&state.db, &key, &secret).await
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
    let current_password = zeroize::Zeroizing::new(current_password);

    // Hold the mutex through verify to prevent TOCTOU on the failure counter.
    let mut failures = state.unlock_failures.lock().await;

    if let Some(until) = failures.1 {
        if SystemTime::now() < until {
            return Err(AppError::Vault(
                "too many failed attempts — please wait before trying again".into(),
            ));
        }
        failures.1 = None;
    }

    match master_password::verify(&state.db, &current_password).await? {
        None => {
            failures.0 += 1;
            if failures.0 >= 5 {
                let extra = (failures.0 - 5).min(7);
                let secs = 30u64 * (1u64 << extra);
                failures.1 = Some(SystemTime::now() + Duration::from_secs(secs));
            }
            let count = failures.0;
            let until = failures.1;
            drop(failures);
            persist_lockout(&state.db, count, until).await;
            Err(AppError::Vault("incorrect password".into()))
        }
        Some(old_key) => {
            *failures = (0, None);
            drop(failures);
            persist_lockout(&state.db, 0, None).await;
            // Re-encrypt all credentials from the PBKDF2 key to the no-password
            // placeholder ([0u8;32]) before removing the master password.
            let zero_key = [0u8; 32];
            vault::reencrypt_all(&state.db, &*old_key, &zero_key).await?;
            master_password::disable_password(&state.db).await?;
            *state.vault_key.lock().await = Some(zeroize::Zeroizing::new(zero_key));
            Ok(())
        }
    }
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
    let new_password = zeroize::Zeroizing::new(new_password);
    if new_password.len() < 8 {
        return Err(AppError::Validation(
            "master password must be at least 8 characters".into(),
        ));
    }
    let new_key = master_password::setup(&state.db, &new_password).await?;
    master_password::set_password_required(&state.db, true).await?;
    // Credentials were stored with the no-password placeholder ([0u8;32]); re-encrypt to the new key.
    let zero_key = [0u8; 32];
    vault::reencrypt_all(&state.db, &zero_key, &*new_key).await?;
    *state.vault_key.lock().await = Some(new_key);
    Ok(())
}

/// Changes the master password. Requires the current password to confirm.
#[tauri::command]
pub async fn vault_change_password(
    current_password: String,
    new_password: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let current_password = zeroize::Zeroizing::new(current_password);
    let new_password = zeroize::Zeroizing::new(new_password);

    if new_password.len() < 8 {
        return Err(AppError::Validation(
            "master password must be at least 8 characters".into(),
        ));
    }

    // Hold the mutex through verify to prevent TOCTOU on the failure counter.
    let mut failures = state.unlock_failures.lock().await;

    if let Some(until) = failures.1 {
        if SystemTime::now() < until {
            return Err(AppError::Vault(
                "too many failed attempts — please wait before trying again".into(),
            ));
        }
        failures.1 = None;
    }

    match master_password::verify(&state.db, &current_password).await? {
        None => {
            failures.0 += 1;
            if failures.0 >= 5 {
                let extra = (failures.0 - 5).min(7);
                let secs = 30u64 * (1u64 << extra);
                failures.1 = Some(SystemTime::now() + Duration::from_secs(secs));
            }
            let count = failures.0;
            let until = failures.1;
            drop(failures);
            persist_lockout(&state.db, count, until).await;
            Err(AppError::Vault("incorrect current password".into()))
        }
        Some(old_key) => {
            *failures = (0, None);
            drop(failures);
            persist_lockout(&state.db, 0, None).await;
            let new_key = master_password::setup(&state.db, &new_password).await?;
            vault::reencrypt_all(&state.db, &*old_key, &*new_key).await?;
            *state.vault_key.lock().await = Some(new_key);
            Ok(())
        }
    }
}

/// Decrypts and returns a server's stored credential. Vault must be unlocked.
///
/// Requires `server_id` and verifies the server actually owns
/// `vault_credential_id` before decrypting — without this check, any webview
/// JS could decrypt an arbitrary credential by guessing/observing its id.
#[tauri::command]
pub async fn retrieve_credential(
    server_id: String,
    vault_credential_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, AppError> {
    let server = crate::db::queries::get_server_db(&state.db, &server_id).await?;
    if server.server.vault_credential_id.as_deref() != Some(vault_credential_id.as_str()) {
        return Err(AppError::Validation(
            "vault_credential_id does not belong to server_id".into(),
        ));
    }

    let key: [u8; 32] = {
        let guard = state.vault_key.lock().await;
        match guard.as_ref() {
            None => return Err(AppError::Vault("vault is locked".into())),
            Some(k) => **k,
        }
    };
    vault::retrieve_credential(&state.db, &key, &vault_credential_id).await
}

#[tauri::command]
pub async fn delete_credential(
    vault_credential_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    if state.vault_key.lock().await.is_none() {
        return Err(AppError::Vault("vault is locked".into()));
    }
    vault::delete_credential(&state.db, &vault_credential_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    async fn make_db() -> sqlx::SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::query(
            "CREATE TABLE vault_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)",
        )
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    #[tokio::test]
    async fn load_lockout_returns_zero_on_empty_db() {
        let db = make_db().await;
        let (failures, until) = load_lockout(&db).await;
        assert_eq!(failures, 0);
        assert!(until.is_none());
    }

    #[tokio::test]
    async fn persist_and_reload_failure_count() {
        let db = make_db().await;
        persist_lockout(&db, 3, None).await;
        let (failures, until) = load_lockout(&db).await;
        assert_eq!(failures, 3);
        assert!(until.is_none());
    }

    #[tokio::test]
    async fn persist_and_reload_lockout_expiry() {
        let db = make_db().await;
        let expiry = SystemTime::now() + Duration::from_secs(3600);
        persist_lockout(&db, 5, Some(expiry)).await;
        let (_, until) = load_lockout(&db).await;
        let loaded = until.expect("expiry should be present");
        let diff = loaded
            .duration_since(expiry)
            .unwrap_or_else(|e| e.duration());
        assert!(diff < Duration::from_secs(1));
    }

    #[tokio::test]
    async fn load_lockout_discards_expired_lockout() {
        let db = make_db().await;
        let past = UNIX_EPOCH + Duration::from_secs(1);
        persist_lockout(&db, 5, Some(past)).await;
        let (failures, until) = load_lockout(&db).await;
        assert_eq!(failures, 5);
        assert!(until.is_none());
    }

    #[tokio::test]
    async fn persist_lockout_zero_clears_state() {
        let db = make_db().await;
        let future = SystemTime::now() + Duration::from_secs(3600);
        persist_lockout(&db, 3, Some(future)).await;
        persist_lockout(&db, 0, None).await;
        let (failures, until) = load_lockout(&db).await;
        assert_eq!(failures, 0);
        assert!(until.is_none());
    }
}
