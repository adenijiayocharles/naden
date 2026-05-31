use base64::{engine::general_purpose::STANDARD, Engine as _};
use pbkdf2::pbkdf2_hmac;
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;
use subtle::ConstantTimeEq;
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
    sqlx::query("INSERT OR REPLACE INTO vault_meta (key, value) VALUES ('password_required', ?)")
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
    let salt_b64 = STANDARD.encode(salt);
    let password_owned = password.to_owned();
    let key = tokio::task::spawn_blocking(move || derive_key(&password_owned, &salt))
        .await
        .map_err(|e| AppError::Vault(e.to_string()))?;
    let verification = verification_hash(&key);

    sqlx::query("INSERT OR REPLACE INTO vault_meta (key, value) VALUES ('pbkdf2_salt', ?)")
        .bind(salt_b64)
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

    // Run PBKDF2 on the blocking thread pool — 600k rounds would stall the async executor.
    let password_owned = password.to_owned();
    let (key, needs_rehash) = tokio::task::spawn_blocking(move || {
        let key = derive_key_with_rounds(&password_owned, &salt, ROUNDS);
        if bool::from(verification_hash(&key).ct_eq(stored.as_slice())) {
            return (Some(key), false);
        }
        // Fall back to legacy round count to support vaults created before the upgrade.
        let legacy_key = derive_key_with_rounds(&password_owned, &salt, LEGACY_ROUNDS);
        if bool::from(verification_hash(&legacy_key).ct_eq(stored.as_slice())) {
            // Password correct but legacy rounds; `key` (600k) is already derived, reuse it.
            (Some(key), true)
        } else {
            (None, false)
        }
    })
    .await
    .map_err(|e| AppError::Vault(e.to_string()))?;

    let key = match key {
        None => return Ok(None),
        Some(k) => k,
    };

    if needs_rehash {
        // Transparently upgrade the stored verification to the current round count.
        let new_verification = verification_hash(&key);
        sqlx::query("INSERT OR REPLACE INTO vault_meta (key, value) VALUES ('verification', ?)")
            .bind(STANDARD.encode(new_verification))
            .execute(db)
            .await?;
    }

    Ok(Some(key))
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn make_db() -> SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::query("CREATE TABLE vault_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)")
            .execute(&pool)
            .await
            .unwrap();
        pool
    }

    #[tokio::test]
    async fn is_not_set_up_before_setup() {
        let db = make_db().await;
        assert!(!is_setup(&db).await.unwrap());
    }

    #[tokio::test]
    async fn is_set_up_after_setup() {
        let db = make_db().await;
        setup(&db, "correct-horse-battery").await.unwrap();
        assert!(is_setup(&db).await.unwrap());
    }

    #[tokio::test]
    async fn verify_correct_password_returns_key() {
        let db = make_db().await;
        setup(&db, "my-secret-pass").await.unwrap();
        let result = verify(&db, "my-secret-pass").await.unwrap();
        assert!(result.is_some());
    }

    #[tokio::test]
    async fn verify_wrong_password_returns_none() {
        let db = make_db().await;
        setup(&db, "correct-pass").await.unwrap();
        let result = verify(&db, "wrong-pass").await.unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn verify_upgrades_legacy_rounds_transparently() {
        let db = make_db().await;
        let password = "legacy-password";

        // Manually insert a vault set up with LEGACY_ROUNDS
        let salt = generate_salt();
        let legacy_key = derive_key_with_rounds(password, &salt, LEGACY_ROUNDS);
        let legacy_verification = verification_hash(&legacy_key);
        sqlx::query("INSERT INTO vault_meta (key, value) VALUES ('pbkdf2_salt', ?)")
            .bind(STANDARD.encode(salt))
            .execute(&db)
            .await
            .unwrap();
        sqlx::query("INSERT INTO vault_meta (key, value) VALUES ('verification', ?)")
            .bind(STANDARD.encode(legacy_verification))
            .execute(&db)
            .await
            .unwrap();

        // verify() should accept the password and re-hash at current rounds
        let result = verify(&db, password).await.unwrap();
        assert!(result.is_some());

        // A second verify should now succeed with the re-hashed verification
        let result2 = verify(&db, password).await.unwrap();
        assert!(result2.is_some());
    }

    #[tokio::test]
    async fn disable_password_removes_credentials() {
        let db = make_db().await;
        setup(&db, "pass").await.unwrap();
        disable_password(&db).await.unwrap();

        // After disable, no salt should exist and password should not be required
        assert!(!is_password_required(&db).await.unwrap());
        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM vault_meta WHERE key = 'pbkdf2_salt'")
                .fetch_one(&db)
                .await
                .unwrap();
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn is_setup_returns_true_when_password_not_required() {
        let db = make_db().await;
        set_password_required(&db, false).await.unwrap();
        // No salt exists, but password is not required — vault is considered set up
        assert!(is_setup(&db).await.unwrap());
    }

    #[tokio::test]
    async fn set_password_required_persists() {
        let db = make_db().await;
        assert!(is_password_required(&db).await.unwrap()); // default true
        set_password_required(&db, false).await.unwrap();
        assert!(!is_password_required(&db).await.unwrap());
        set_password_required(&db, true).await.unwrap();
        assert!(is_password_required(&db).await.unwrap());
    }

    #[tokio::test]
    async fn returned_keys_are_consistent_across_verify_calls() {
        let db = make_db().await;
        let key1 = setup(&db, "stable-pass").await.unwrap();
        let key2 = verify(&db, "stable-pass").await.unwrap().unwrap();
        // Both derived from the same password + stored salt — must be equal
        assert_eq!(key1.as_slice(), key2.as_slice());
    }
}
