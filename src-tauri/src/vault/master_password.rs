use base64::{engine::general_purpose::STANDARD, Engine as _};
use pbkdf2::pbkdf2_hmac;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use sqlx::SqlitePool;
use zeroize::Zeroizing;

use crate::error::AppError;

// OWASP 2023 recommendation for PBKDF2-HMAC-SHA256.
const ROUNDS: u32 = 600_000;
// Accepted on upgrade path only — vaults hashed at this count are re-derived and re-stored.
const LEGACY_ROUNDS: u32 = 100_000;
const KEY_LEN: usize = 32;

fn generate_salt() -> [u8; KEY_LEN] {
    let mut salt = [0u8; KEY_LEN];
    getrandom::getrandom(&mut salt).expect("OS RNG unavailable");
    salt
}

fn derive_key_with_rounds(password: &str, salt: &[u8], rounds: u32) -> Zeroizing<[u8; KEY_LEN]> {
    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, rounds, key.as_mut());
    key
}

pub fn derive_key(password: &str, salt: &[u8]) -> Zeroizing<[u8; KEY_LEN]> {
    derive_key_with_rounds(password, salt, ROUNDS)
}

fn verification_hash(key: &[u8; KEY_LEN]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(key);
    h.update(b"ssh-manager-vault-verify-v1");
    h.finalize().into()
}

pub async fn is_password_required(db: &SqlitePool) -> Result<bool, AppError> {
    let val: Option<String> =
        sqlx::query_scalar("SELECT value FROM vault_meta WHERE key = 'password_required'")
            .fetch_optional(db)
            .await?;
    // Default true: existing vaults that pre-date this setting require a password.
    Ok(val.map(|v| v != "false").unwrap_or(true))
}

pub async fn set_password_required(db: &SqlitePool, required: bool) -> Result<(), AppError> {
    sqlx::query(
        "INSERT OR REPLACE INTO vault_meta (key, value) VALUES ('password_required', ?)",
    )
    .bind(if required { "true" } else { "false" })
    .execute(db)
    .await?;
    Ok(())
}

/// Removes PBKDF2 credentials and marks the vault as not requiring a password.
pub async fn disable_password(db: &SqlitePool) -> Result<(), AppError> {
    sqlx::query("DELETE FROM vault_meta WHERE key IN ('pbkdf2_salt', 'verification')")
        .execute(db)
        .await?;
    set_password_required(db, false).await
}

pub async fn is_setup(db: &SqlitePool) -> Result<bool, AppError> {
    // When password protection is off the vault is always considered set up.
    if !is_password_required(db).await? {
        return Ok(true);
    }
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM vault_meta WHERE key = 'pbkdf2_salt'")
            .fetch_one(db)
            .await?;
    Ok(count > 0)
}

/// Initialises the vault with a new master password. Returns the unlocked session key.
pub async fn setup(db: &SqlitePool, password: &str) -> Result<Zeroizing<[u8; KEY_LEN]>, AppError> {
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
///
/// If the stored hash was derived with a legacy round count, the vault is transparently
/// re-hashed at the current round count so the upgrade happens on first successful unlock.
pub async fn verify(
    db: &SqlitePool,
    password: &str,
) -> Result<Option<Zeroizing<[u8; KEY_LEN]>>, AppError> {
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

    // Try current round count first.
    let key = derive_key(password, &salt);
    if verification_hash(&key).ct_eq(stored.as_slice()).into() {
        return Ok(Some(key));
    }

    // Fall back to legacy round count to support vaults created before the upgrade.
    let legacy_key = derive_key_with_rounds(password, &salt, LEGACY_ROUNDS);
    if !bool::from(verification_hash(&legacy_key).ct_eq(stored.as_slice())) {
        return Ok(None); // Wrong password.
    }

    // Correct password but legacy rounds — transparently re-hash at current strength.
    let new_key = derive_key(password, &salt);
    let new_verification = verification_hash(&new_key);
    sqlx::query("INSERT OR REPLACE INTO vault_meta (key, value) VALUES ('verification', ?)")
        .bind(STANDARD.encode(new_verification))
        .execute(db)
        .await?;

    Ok(Some(new_key))
}
