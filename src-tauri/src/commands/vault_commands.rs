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
    match crate::vault::master_password::verify(&state.db, &master_password).await? {
        Some(key) => {
            *state.vault_key.lock().await = Some(key);
            Ok(true)
        }
        None => Ok(false),
    }
}

#[tauri::command]
pub async fn vault_is_unlocked(state: tauri::State<'_, AppState>) -> Result<bool, AppError> {
    Ok(state.vault_key.lock().await.is_some())
}

#[tauri::command]
pub async fn vault_lock(state: tauri::State<'_, AppState>) -> Result<(), AppError> {
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

/// Deletes a secret from the OS keychain. Does not require vault to be unlocked.
#[tauri::command]
pub async fn delete_credential(
    vault_credential_id: String,
    _state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    vault::delete_credential(&vault_credential_id).await
}
