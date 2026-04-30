use base64::{engine::general_purpose::STANDARD, Engine as _};
use pbkdf2::pbkdf2_hmac;
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;

use crate::error::AppError;

const ROUNDS: u32 = 100_000;
const KEY_LEN: usize = 32;

fn generate_salt() -> [u8; KEY_LEN] {
    let mut salt = [0u8; KEY_LEN];
    getrandom::getrandom(&mut salt).expect("OS RNG unavailable");
    salt
}

pub fn derive_key(password: &str, salt: &[u8]) -> [u8; KEY_LEN] {
    let mut key = [0u8; KEY_LEN];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, ROUNDS, &mut key);
    key
}

fn verification_hash(key: &[u8; KEY_LEN]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(key);
    h.update(b"ssh-manager-vault-verify-v1");
    h.finalize().into()
}

pub async fn is_setup(db: &SqlitePool) -> Result<bool, AppError> {
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM vault_meta WHERE key = 'pbkdf2_salt'")
            .fetch_one(db)
            .await?;
    Ok(count > 0)
}

/// Initialises the vault with a new master password. Returns the unlocked session key.
pub async fn setup(db: &SqlitePool, password: &str) -> Result<[u8; KEY_LEN], AppError> {
    let salt = generate_salt();
    let key = derive_key(password, &salt);
    let verification = verification_hash(&key);

    sqlx::query("INSERT OR REPLACE INTO vault_meta (key, value) VALUES ('pbkdf2_salt', ?)")
        .bind(STANDARD.encode(salt))
        .execute(db)
        .await?;

    sqlx::query("INSERT OR REPLACE INTO vault_meta (key, value) VALUES ('verification', ?)")
        .bind(STANDARD.encode(verification))
        .execute(db)
        .await?;

    Ok(key)
}

/// Verifies the master password. Returns `Some(key)` on success, `None` on wrong password.
pub async fn verify(db: &SqlitePool, password: &str) -> Result<Option<[u8; KEY_LEN]>, AppError> {
    let salt_b64: Option<String> =
        sqlx::query_scalar("SELECT value FROM vault_meta WHERE key = 'pbkdf2_salt'")
            .fetch_optional(db)
            .await?;

    let salt_b64 = salt_b64.ok_or_else(|| AppError::Vault("vault not set up".into()))?;
    let salt = STANDARD
        .decode(&salt_b64)
        .map_err(|e| AppError::Vault(e.to_string()))?;

    let stored_b64: String =
        sqlx::query_scalar("SELECT value FROM vault_meta WHERE key = 'verification'")
            .fetch_one(db)
            .await?;
    let stored = STANDARD
        .decode(&stored_b64)
        .map_err(|e| AppError::Vault(e.to_string()))?;

    let key = derive_key(password, &salt);
    let computed = verification_hash(&key);

    if computed.as_slice() == stored.as_slice() {
        Ok(Some(key))
    } else {
        Ok(None)
    }
}
