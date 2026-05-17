pub mod master_password;

use keyring::Entry;
use tokio::task;
use uuid::Uuid;

use crate::error::AppError;

const SERVICE: &str = "com.sshmanager.app";

/// Stores `secret` in the OS keychain. Returns a `vault_credential_id` UUID to
/// persist in `servers.vault_credential_id` — the actual secret never touches the DB.
pub async fn store_credential(secret: &str) -> Result<String, AppError> {
    let credential_id = Uuid::new_v4().to_string();
    let id = credential_id.clone();
    let secret = secret.to_owned();

    task::spawn_blocking(move || {
        Entry::new(SERVICE, &id)
            .map_err(|e| AppError::Vault(e.to_string()))?
            .set_password(&secret)
            .map_err(|e| AppError::Vault(e.to_string()))
    })
    .await
    .map_err(|e| AppError::Vault(e.to_string()))??;

    Ok(credential_id)
}

/// Retrieves a secret from the OS keychain by `vault_credential_id`.
pub async fn retrieve_credential(vault_credential_id: &str) -> Result<String, AppError> {
    let id = vault_credential_id.to_owned();

    task::spawn_blocking(move || {
        Entry::new(SERVICE, &id)
            .map_err(|e| AppError::Vault(e.to_string()))?
            .get_password()
            .map_err(|e| AppError::Vault(e.to_string()))
    })
    .await
    .map_err(|e| AppError::Vault(e.to_string()))?
}

/// Deletes a secret from the OS keychain.
pub async fn delete_credential(vault_credential_id: &str) -> Result<(), AppError> {
    let id = vault_credential_id.to_owned();

    task::spawn_blocking(move || {
        Entry::new(SERVICE, &id)
            .map_err(|e| AppError::Vault(e.to_string()))?
            .delete_credential()
            .map_err(|e| AppError::Vault(e.to_string()))
    })
    .await
    .map_err(|e| AppError::Vault(e.to_string()))?
}
