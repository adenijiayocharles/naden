use base64::{engine::general_purpose::STANDARD, Engine as _};
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

/// Increments the failure counter and sets an exponential backoff lockout expiry.
/// Returns the updated `(count, expiry)` values for persisting.
fn record_failed_attempt(failures: &mut (u32, Option<SystemTime>)) -> (u32, Option<SystemTime>) {
    failures.0 += 1;
    // After 5 failures, apply exponential backoff: 30 s × 2^(extra failures), max 1 h.
    if failures.0 >= 5 {
        let extra = (failures.0 - 5).min(7);
        let secs = 30u64 * (1u64 << extra);
        failures.1 = Some(SystemTime::now() + Duration::from_secs(secs));
    }
    (failures.0, failures.1)
}

// ── Device key (no-password mode) ────────────────────────────────────────────

/// Returns the stable per-installation key used when no master password is set.
///
/// On first call it generates a random key and atomically migrates any existing
/// credentials from the legacy all-zero placeholder to the new device key.
/// Subsequent calls return the stored key without touching credentials.
async fn get_or_create_device_key(db: &sqlx::SqlitePool) -> Result<[u8; 32], AppError> {
    let stored: Option<String> =
        sqlx::query_scalar("SELECT value FROM vault_meta WHERE key = 'no_password_device_key'")
            .fetch_optional(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

    if let Some(b64) = stored {
        let bytes = STANDARD.decode(&b64).map_err(|e| AppError::Vault(e.to_string()))?;
        if bytes.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&bytes);
            return Ok(key);
        }
    }

    // Generate a new device key and atomically migrate any legacy zero-key credentials.
    let mut new_key = [0u8; 32];
    getrandom::getrandom(&mut new_key).map_err(|e| AppError::Vault(e.to_string()))?;
    let new_key_b64 = STANDARD.encode(new_key);
    let zero_key = [0u8; 32];

    let mut tx = db
        .begin()
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    vault::reencrypt_all_tx(&mut tx, &zero_key, &new_key).await?;
    sqlx::query(
        "INSERT OR REPLACE INTO vault_meta (key, value) VALUES ('no_password_device_key', ?)",
    )
    .bind(&new_key_b64)
    .execute(&mut *tx)
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;
    tx.commit()
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(new_key)
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
        let device_key = get_or_create_device_key(&state.db).await?;
        *state.vault_key.lock().await = Some(zeroize::Zeroizing::new(device_key));
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
            let (count, until) = record_failed_attempt(&mut failures);
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
            let device_key = get_or_create_device_key(&state.db).await?;
            *key = Some(zeroize::Zeroizing::new(device_key));
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
///
/// Re-encrypts all credentials from the PBKDF2 key to a randomly generated
/// device key.  The salt/verification removal and credential re-encryption are
/// performed in a single atomic transaction to prevent vault corruption on crash.
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
            let (count, until) = record_failed_attempt(&mut failures);
            drop(failures);
            persist_lockout(&state.db, count, until).await;
            Err(AppError::Vault("incorrect password".into()))
        }
        Some(old_key) => {
            *failures = (0, None);
            drop(failures);
            persist_lockout(&state.db, 0, None).await;

            // Generate a random per-device key for no-password mode.
            let mut device_key = [0u8; 32];
            getrandom::getrandom(&mut device_key)
                .map_err(|e| AppError::Vault(e.to_string()))?;
            let device_key_b64 = STANDARD.encode(device_key);

            // Atomically: re-encrypt credentials + store device key + remove PBKDF2 meta.
            let mut tx = state
                .db
                .begin()
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;
            vault::reencrypt_all_tx(&mut tx, &*old_key, &device_key).await?;
            sqlx::query("INSERT OR REPLACE INTO vault_meta (key, value) VALUES ('no_password_device_key', ?)")
                .bind(&device_key_b64)
                .execute(&mut *tx)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;
            sqlx::query(
                "DELETE FROM vault_meta WHERE key IN ('pbkdf2_salt', 'verification')",
            )
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
            sqlx::query("INSERT OR REPLACE INTO vault_meta (key, value) VALUES ('password_required', 'false')")
                .execute(&mut *tx)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;
            tx.commit()
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;

            *state.vault_key.lock().await = Some(zeroize::Zeroizing::new(device_key));
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
    let device_key = get_or_create_device_key(&state.db).await?;
    *state.vault_key.lock().await = Some(zeroize::Zeroizing::new(device_key));
    Ok(())
}

/// Enables vault password protection and sets an initial master password.
///
/// Re-encrypts all credentials from the device key to the new PBKDF2 key.
/// The credential re-encryption and the new salt/verification write are
/// performed in a single atomic transaction.
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

    // Derive the new key without any DB writes yet.
    let (new_key, salt_b64, verification_b64) =
        master_password::prepare_setup(&new_password).await?;

    // Current device key — credentials were stored under it.
    let device_key = get_or_create_device_key(&state.db).await?;

    // Atomically: re-encrypt + write new PBKDF2 meta + mark password required.
    let mut tx = state
        .db
        .begin()
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    vault::reencrypt_all_tx(&mut tx, &device_key, &*new_key).await?;
    master_password::commit_setup_tx(&mut tx, &salt_b64, &verification_b64).await?;
    sqlx::query("INSERT OR REPLACE INTO vault_meta (key, value) VALUES ('password_required', 'true')")
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    tx.commit()
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    *state.vault_key.lock().await = Some(new_key);
    Ok(())
}

/// Changes the master password. Requires the current password to confirm.
///
/// The credential re-encryption and the new salt/verification write are
/// performed in a single atomic transaction so a crash cannot leave the vault
/// in a state where neither the old nor the new password works.
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
            let (count, until) = record_failed_attempt(&mut failures);
            drop(failures);
            persist_lockout(&state.db, count, until).await;
            Err(AppError::Vault("incorrect current password".into()))
        }
        Some(old_key) => {
            *failures = (0, None);
            drop(failures);
            persist_lockout(&state.db, 0, None).await;

            // Derive the new key without any DB writes yet.
            let (new_key, salt_b64, verification_b64) =
                master_password::prepare_setup(&new_password).await?;

            // Atomically: re-encrypt credentials + write new salt/verification.
            let mut tx = state
                .db
                .begin()
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;
            vault::reencrypt_all_tx(&mut tx, &*old_key, &*new_key).await?;
            master_password::commit_setup_tx(&mut tx, &salt_b64, &verification_b64).await?;
            tx.commit()
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;

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

/// Deletes a stored credential.
///
/// When the credential is referenced by a server, the caller must supply the
/// matching `server_id` — this prevents a compromised renderer from deleting
/// another server's credentials by guessing the credential UUID.
///
/// Unowned credentials (e.g. orphaned by a failed server-create) may be
/// deleted without a `server_id`.
#[tauri::command]
pub async fn delete_credential(
    vault_credential_id: String,
    server_id: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    if state.vault_key.lock().await.is_none() {
        return Err(AppError::Vault("vault is locked".into()));
    }

    // Check whether this credential is referenced by any server.
    let owner_id: Option<String> =
        sqlx::query_scalar("SELECT id FROM servers WHERE vault_credential_id = ?")
            .bind(&vault_credential_id)
            .fetch_optional(&state.db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

    if let Some(ref owner_id) = owner_id {
        match server_id.as_deref() {
            Some(sid) if sid == owner_id => {}
            _ => {
                return Err(AppError::Validation(
                    "vault_credential_id does not belong to server_id".into(),
                ))
            }
        }
    }

    vault::delete_credential(&state.db, &vault_credential_id).await
}

#[cfg(test)]
#[path = "vault_commands_tests.rs"]
mod tests;
