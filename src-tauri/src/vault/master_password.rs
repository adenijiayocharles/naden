use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
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

// Domain-separated plaintext for AES-GCM verification (v2 format).
const VERIFY_V2_PLAINTEXT: &[u8] = b"naden-vault-verify-v2";
// Byte length of a v2 blob: 12-byte nonce + plaintext_len + 16-byte GCM tag.
const VERIFY_V2_LEN: usize = 12 + VERIFY_V2_PLAINTEXT.len() + 16;

pub(crate) fn generate_salt() -> Result<[u8; KEY_LEN], AppError> {
    let mut salt = [0u8; KEY_LEN];
    getrandom::getrandom(&mut salt).map_err(|e| AppError::Vault(e.to_string()))?;
    Ok(salt)
}

fn derive_key_with_rounds(password: &str, salt: &[u8], rounds: u32) -> Zeroizing<[u8; KEY_LEN]> {
    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, rounds, key.as_mut());
    key
}

pub fn derive_key(password: &str, salt: &[u8]) -> Zeroizing<[u8; KEY_LEN]> {
    derive_key_with_rounds(password, salt, ROUNDS)
}

// ── V2 verification: AES-256-GCM ─────────────────────────────────────────────

/// Encrypts VERIFY_V2_PLAINTEXT under `key` with a fresh random nonce.
/// Returns nonce (12 bytes) || GCM ciphertext (plaintext_len + 16-byte tag).
fn make_verification_tag_v2(key: &[u8; KEY_LEN]) -> Result<Vec<u8>, AppError> {
    let mut nonce_bytes = [0u8; 12];
    getrandom::getrandom(&mut nonce_bytes).map_err(|e| AppError::Vault(e.to_string()))?;
    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|_| AppError::Vault("invalid key length".into()))?;
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), VERIFY_V2_PLAINTEXT)
        .map_err(|_| AppError::Vault("verification tag creation failed".into()))?;
    let mut out = Vec::with_capacity(12 + ciphertext.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

/// Returns `true` if `stored` (nonce || GCM ciphertext) decrypts correctly under `key`.
fn check_verification_tag_v2(key: &[u8; KEY_LEN], stored: &[u8]) -> bool {
    if stored.len() != VERIFY_V2_LEN {
        return false;
    }
    let (nonce_bytes, ciphertext) = stored.split_at(12);
    let cipher = match Aes256Gcm::new_from_slice(key) {
        Ok(c) => c,
        Err(_) => return false,
    };
    cipher
        .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
        .is_ok()
}

// ── V1 verification: SHA-256 (legacy read path only) ─────────────────────────
// NOTE: V1 vaults use SHA-256 for key verification, which is orders of magnitude
// weaker against offline brute-force than V2's AES-GCM round-trip. The upgrade
// to V2 runs automatically on the first successful unlock. A V1 vault that has
// NEVER been unlocked since creation remains weaker until it is opened once.
// If this becomes a concern, add a forced-migration prompt on open that requires
// the user to unlock (and thus upgrade) before any credentials can be accessed.

fn sha256_verification_hash(key: &[u8; KEY_LEN]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(key);
    h.update(b"naden-vault-verify-v1");
    h.finalize().into()
}

// ── Public API ────────────────────────────────────────────────────────────────

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

/// Derives a new key and prepares salt + AES-GCM verification tag without touching the DB.
/// Returns `(key, salt_b64, verification_b64)`.
///
/// Call `commit_setup_tx` inside an outer transaction to make key-rotation and
/// credential re-encryption atomic.
pub async fn prepare_setup(
    password: &str,
) -> Result<(Zeroizing<[u8; KEY_LEN]>, String, String), AppError> {
    let salt = generate_salt()?;
    let salt_b64 = STANDARD.encode(salt);
    let password_owned = Zeroizing::new(password.to_owned());
    let key = tokio::task::spawn_blocking(move || derive_key(&password_owned, &salt))
        .await
        .map_err(|e| AppError::Vault(e.to_string()))?;
    let verification_tag = make_verification_tag_v2(&key)?;
    let verification_b64 = STANDARD.encode(&verification_tag);
    Ok((key, salt_b64, verification_b64))
}

/// Writes pre-derived salt and verification into `vault_meta` within `tx`.
///
/// Used together with `vault::reencrypt_all_tx` to make password-change and
/// credential re-encryption atomic in a single transaction.
pub async fn commit_setup_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    salt_b64: &str,
    verification_b64: &str,
) -> Result<(), AppError> {
    sqlx::query("INSERT OR REPLACE INTO vault_meta (key, value) VALUES ('pbkdf2_salt', ?)")
        .bind(salt_b64)
        .execute(&mut **tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    sqlx::query("INSERT OR REPLACE INTO vault_meta (key, value) VALUES ('verification', ?)")
        .bind(verification_b64)
        .execute(&mut **tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

/// Initialises the vault with a new master password. Returns the unlocked session key.
pub async fn setup(db: &SqlitePool, password: &str) -> Result<Zeroizing<[u8; KEY_LEN]>, AppError> {
    let (key, salt_b64, verification_b64) = prepare_setup(password).await?;
    sqlx::query("INSERT OR REPLACE INTO vault_meta (key, value) VALUES ('pbkdf2_salt', ?)")
        .bind(&salt_b64)
        .execute(db)
        .await?;
    sqlx::query("INSERT OR REPLACE INTO vault_meta (key, value) VALUES ('verification', ?)")
        .bind(&verification_b64)
        .execute(db)
        .await?;
    Ok(key)
}

/// Verifies the master password against the stored verification blob.
/// Returns `Some(key)` on success, `None` on wrong password.
///
/// Transparently upgrades V1 (SHA-256) and legacy-PBKDF2 vaults to the V2
/// AES-GCM format on the first successful unlock.
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

    let password_owned = Zeroizing::new(password.to_owned());
    let (key, needs_upgrade) =
        tokio::task::spawn_blocking(move || -> (Option<Zeroizing<[u8; KEY_LEN]>>, bool) {
            let key = derive_key_with_rounds(&password_owned, &salt, ROUNDS);

            if stored.len() == VERIFY_V2_LEN {
                // V2 AES-GCM — no upgrade needed
                return (
                    check_verification_tag_v2(&key, &stored).then_some(key),
                    false,
                );
            }

            // V1 SHA-256 path (32 decoded bytes)
            if stored.len() == 32 {
                if bool::from(sha256_verification_hash(&key).ct_eq(stored.as_slice())) {
                    return (Some(key), true);
                }
                // Try legacy PBKDF2 round count; `key` (600 k rounds) is already derived.
                let legacy_key = derive_key_with_rounds(&password_owned, &salt, LEGACY_ROUNDS);
                if bool::from(sha256_verification_hash(&legacy_key).ct_eq(stored.as_slice())) {
                    return (Some(key), true);
                }
            }

            (None, false)
        })
        .await
        .map_err(|e| AppError::Vault(e.to_string()))?;

    let key = match key {
        None => return Ok(None),
        Some(k) => k,
    };

    if needs_upgrade {
        // Guard against a concurrent setup() having rotated the salt since we read it.
        let current_salt: Option<String> =
            sqlx::query_scalar("SELECT value FROM vault_meta WHERE key = 'pbkdf2_salt'")
                .fetch_optional(db)
                .await?;
        if current_salt.as_deref() == Some(salt_b64.as_str()) {
            if let Ok(new_tag) = make_verification_tag_v2(&key) {
                let _ = sqlx::query(
                    "INSERT OR REPLACE INTO vault_meta (key, value) VALUES ('verification', ?)",
                )
                .bind(STANDARD.encode(&new_tag))
                .execute(db)
                .await;
            }
        }
    }

    Ok(Some(key))
}

#[cfg(test)]
#[path = "master_password_tests.rs"]
mod tests;
