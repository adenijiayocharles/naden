use crate::vault::{self, master_password};
use crate::error::AppError;
use crate::AppState;

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
            if std::time::Instant::now() < until {
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
                *lockout_until =
                    Some(std::time::Instant::now() + std::time::Duration::from_secs(secs));
            }
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
    if master_password::verify(&state.db, &current_password).await?.is_none() {
        return Err(AppError::Vault("incorrect password".into()));
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
    if master_password::verify(&state.db, &current_password).await?.is_none() {
        return Err(AppError::Vault("incorrect current password".into()));
    }
    *state.unlock_failures.lock().await = (0, None);
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
