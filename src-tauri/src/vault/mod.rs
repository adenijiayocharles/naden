pub mod master_password;

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use sqlx::SqlitePool;
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::error::AppError;

/// Encrypts `secret` with `key` (AES-256-GCM) and stores the result in
/// `vault_credentials`. Returns a UUID to persist in `servers.vault_credential_id`.
pub async fn store_credential(
    db: &SqlitePool,
    key: &[u8],
    secret: &str,
) -> Result<String, AppError> {
    let id = Uuid::new_v4().to_string();

    let mut nonce_bytes = [0u8; 12];
    getrandom::getrandom(&mut nonce_bytes).map_err(|e| AppError::Vault(e.to_string()))?;

    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|_| AppError::Vault("invalid key length".into()))?;
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), secret.as_bytes())
        .map_err(|_| AppError::Vault("encryption failed".into()))?;

    sqlx::query("INSERT INTO vault_credentials (id, nonce, ciphertext) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(nonce_bytes.as_slice())
        .bind(&ciphertext)
        .execute(db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(id)
}

/// Decrypts and returns the secret stored under `id`.
pub async fn retrieve_credential(
    db: &SqlitePool,
    key: &[u8],
    id: &str,
) -> Result<String, AppError> {
    let row: Option<(Vec<u8>, Vec<u8>)> =
        sqlx::query_as("SELECT nonce, ciphertext FROM vault_credentials WHERE id = ?")
            .bind(id)
            .fetch_optional(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

    let (nonce_bytes, ciphertext) =
        row.ok_or_else(|| AppError::Vault("credential not found".into()))?;

    if nonce_bytes.len() != 12 {
        return Err(AppError::Vault(
            "corrupt credential: unexpected nonce length".into(),
        ));
    }

    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|_| AppError::Vault("invalid key length".into()))?;
    let plaintext = Zeroizing::new(
        cipher
            .decrypt(Nonce::from_slice(&nonce_bytes), ciphertext.as_ref())
            .map_err(|_| {
                AppError::Vault("decryption failed — wrong vault key or corrupt data".into())
            })?,
    );

    String::from_utf8(plaintext.to_vec()).map_err(|e| AppError::Vault(e.to_string()))
}

/// Re-encrypts `secret` over an existing credential row in place, generating a
/// fresh nonce. The credential ID is preserved so no archive pointer update is
/// needed — safe to call concurrently with reads.
pub async fn update_credential(
    db: &SqlitePool,
    key: &[u8],
    id: &str,
    secret: &str,
) -> Result<(), AppError> {
    let mut nonce_bytes = [0u8; 12];
    getrandom::getrandom(&mut nonce_bytes).map_err(|e| AppError::Vault(e.to_string()))?;

    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|_| AppError::Vault("invalid key length".into()))?;
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), secret.as_bytes())
        .map_err(|_| AppError::Vault("encryption failed".into()))?;

    sqlx::query("UPDATE vault_credentials SET nonce = ?, ciphertext = ? WHERE id = ?")
        .bind(nonce_bytes.as_slice())
        .bind(&ciphertext)
        .bind(id)
        .execute(db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

/// Removes a credential row. No-ops silently when the ID does not exist.
pub async fn delete_credential(db: &SqlitePool, id: &str) -> Result<(), AppError> {
    sqlx::query("DELETE FROM vault_credentials WHERE id = ?")
        .bind(id)
        .execute(db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

/// Re-encrypts every stored credential from `old_key` to `new_key` within an
/// existing caller-owned transaction.  Use this when the re-encryption must be
/// atomic with other DB writes (e.g. writing new PBKDF2 salt / verification).
pub async fn reencrypt_all_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    old_key: &[u8],
    new_key: &[u8],
) -> Result<(), AppError> {
    let rows: Vec<(String, Vec<u8>, Vec<u8>)> =
        sqlx::query_as("SELECT id, nonce, ciphertext FROM vault_credentials")
            .fetch_all(&mut **tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

    if rows.is_empty() {
        return Ok(());
    }

    let old_cipher = Aes256Gcm::new_from_slice(old_key)
        .map_err(|_| AppError::Vault("invalid key length".into()))?;
    let new_cipher = Aes256Gcm::new_from_slice(new_key)
        .map_err(|_| AppError::Vault("invalid key length".into()))?;

    for (id, nonce_bytes, ciphertext) in rows {
        if nonce_bytes.len() != 12 {
            return Err(AppError::Vault(format!(
                "re-encryption aborted: corrupt nonce for credential {id}"
            )));
        }

        let plaintext = Zeroizing::new(
            old_cipher
                .decrypt(Nonce::from_slice(&nonce_bytes), ciphertext.as_ref())
                .map_err(|_| {
                    AppError::Vault(format!(
                        "re-encryption aborted: cannot decrypt credential {id}"
                    ))
                })?,
        );

        let mut new_nonce_bytes = [0u8; 12];
        getrandom::getrandom(&mut new_nonce_bytes)
            .map_err(|e| AppError::Vault(e.to_string()))?;

        let new_ciphertext = new_cipher
            .encrypt(Nonce::from_slice(&new_nonce_bytes), plaintext.as_ref())
            .map_err(|_| AppError::Vault("re-encryption aborted: encryption failed".into()))?;

        sqlx::query("UPDATE vault_credentials SET nonce = ?, ciphertext = ? WHERE id = ?")
            .bind(new_nonce_bytes.as_slice())
            .bind(&new_ciphertext)
            .bind(&id)
            .execute(&mut **tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests;
