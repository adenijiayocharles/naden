use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use chrono::Utc;
use pbkdf2::pbkdf2_hmac;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use zeroize::Zeroizing;

use crate::db::queries;
use crate::error::AppError;
use crate::AppState;

const PBKDF2_ITERATIONS: u32 = 600_000;
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;

// ── Backup data model ─────────────────────────────────────────────────────────

/// Mirrors the servers table but omits vault_credential_id so credentials
/// are never written to disk in the backup file.
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct BackupServer {
    id: String,
    display_name: String,
    hostname: String,
    port: i64,
    username: String,
    auth_method: String,
    identity_file_path: Option<String>,
    group_id: Option<String>,
    notes: Option<String>,
    is_jump_host: bool,
    jump_host_id: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct BackupGroup {
    id: String,
    name: String,
    color: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
struct BackupTag {
    id: String,
    name: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
struct BackupServerTag {
    server_id: String,
    tag_id: String,
}

#[derive(Serialize, Deserialize)]
struct Backup {
    version: u32,
    exported_at: String,
    groups: Vec<BackupGroup>,
    tags: Vec<BackupTag>,
    servers: Vec<BackupServer>,
    server_tags: Vec<BackupServerTag>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub servers_imported: usize,
    pub groups_imported: usize,
    pub tags_imported: usize,
    pub servers_skipped: usize,
}

// ── Crypto ────────────────────────────────────────────────────────────────────

fn derive_key(password: &str, salt: &[u8]) -> Zeroizing<[u8; 32]> {
    let mut key = Zeroizing::new([0u8; 32]);
    pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, PBKDF2_ITERATIONS, key.as_mut());
    key
}

fn encrypt(plaintext: &[u8], password: &str) -> Result<Vec<u8>, AppError> {
    let mut salt = [0u8; SALT_LEN];
    let mut nonce_bytes = [0u8; NONCE_LEN];
    getrandom::getrandom(&mut salt).map_err(|e| AppError::Vault(e.to_string()))?;
    getrandom::getrandom(&mut nonce_bytes).map_err(|e| AppError::Vault(e.to_string()))?;

    let key = derive_key(password, &salt);
    let cipher =
        Aes256Gcm::new_from_slice(key.as_ref()).map_err(|e| AppError::Vault(e.to_string()))?;
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), plaintext)
        .map_err(|e| AppError::Vault(format!("encryption failed: {e}")))?;

    // Wire format: [16-byte salt][12-byte nonce][ciphertext + 16-byte GCM tag]
    let mut out = Vec::with_capacity(SALT_LEN + NONCE_LEN + ciphertext.len());
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

fn decrypt(data: &[u8], password: &str) -> Result<Vec<u8>, AppError> {
    if data.len() < SALT_LEN + NONCE_LEN + 16 {
        return Err(AppError::Vault(
            "file is too short to be a valid backup".into(),
        ));
    }
    let (salt, rest) = data.split_at(SALT_LEN);
    let (nonce_bytes, ciphertext) = rest.split_at(NONCE_LEN);

    let key = derive_key(password, salt);
    let cipher =
        Aes256Gcm::new_from_slice(key.as_ref()).map_err(|e| AppError::Vault(e.to_string()))?;
    cipher
        .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
        .map_err(|_| AppError::Vault("incorrect password or corrupted backup file".into()))
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Serialise all server data (no credentials) to JSON, encrypt with AES-256-GCM,
/// and write to `path`. The encryption key is derived from `password` via PBKDF2.
#[tauri::command]
pub async fn export_backup(
    password: String,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    if state.vault_key.lock().await.is_none() {
        return Err(AppError::Vault("vault is locked".into()));
    }
    if password.len() < 8 {
        return Err(AppError::Validation(
            "backup password must be at least 8 characters".into(),
        ));
    }
    let db = &state.db;

    let groups: Vec<BackupGroup> =
        sqlx::query_as("SELECT id, name, color, created_at, updated_at FROM groups ORDER BY name")
            .fetch_all(db)
            .await?;

    let tags: Vec<BackupTag> = sqlx::query_as("SELECT id, name FROM tags ORDER BY name")
        .fetch_all(db)
        .await?;

    // Explicitly list columns — vault_credential_id is intentionally excluded
    let servers: Vec<BackupServer> = sqlx::query_as(
        "SELECT id, display_name, hostname, port, username, auth_method,
                identity_file_path, group_id, notes, is_jump_host, jump_host_id,
                created_at, updated_at
         FROM servers ORDER BY display_name",
    )
    .fetch_all(db)
    .await?;

    let server_tags: Vec<BackupServerTag> =
        sqlx::query_as("SELECT server_id, tag_id FROM server_tags")
            .fetch_all(db)
            .await?;

    let backup = Backup {
        version: 1,
        exported_at: Utc::now().to_rfc3339(),
        groups,
        tags,
        servers,
        server_tags,
    };

    let json = serde_json::to_vec(&backup).map_err(|e| AppError::Validation(e.to_string()))?;
    let encrypted = encrypt(&json, &password)?;

    tokio::fs::write(&path, &encrypted).await?;
    Ok(())
}

/// Decrypt `path`, parse the JSON backup, and merge the contents into the
/// database using INSERT OR IGNORE (existing rows by ID are not overwritten).
#[tauri::command]
pub async fn import_backup(
    path: String,
    password: String,
    state: tauri::State<'_, AppState>,
) -> Result<ImportSummary, AppError> {
    if state.vault_key.lock().await.is_none() {
        return Err(AppError::Vault("vault is locked".into()));
    }
    let data = tokio::fs::read(&path).await?;
    let json = decrypt(&data, &password)?;
    let backup: Backup =
        serde_json::from_slice(&json).map_err(|e| AppError::Validation(e.to_string()))?;

    if backup.version != 1 {
        return Err(AppError::Validation(format!(
            "unsupported backup version {}",
            backup.version
        )));
    }

    let db = &state.db;
    let mut groups_imported = 0usize;
    let mut tags_imported = 0usize;
    let mut servers_imported = 0usize;
    let mut servers_skipped = 0usize;

    for g in &backup.groups {
        let n = sqlx::query(
            "INSERT OR IGNORE INTO groups (id, name, color, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&g.id)
        .bind(&g.name)
        .bind(&g.color)
        .bind(&g.created_at)
        .bind(&g.updated_at)
        .execute(db)
        .await?
        .rows_affected();
        groups_imported += n as usize;
    }

    for t in &backup.tags {
        let n = sqlx::query("INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)")
            .bind(&t.id)
            .bind(&t.name)
            .execute(db)
            .await?
            .rows_affected();
        tags_imported += n as usize;
    }

    for s in &backup.servers {
        let n = sqlx::query(
            "INSERT OR IGNORE INTO servers
             (id, display_name, hostname, port, username, auth_method,
              identity_file_path, group_id, notes, is_jump_host, jump_host_id,
              created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&s.id)
        .bind(&s.display_name)
        .bind(&s.hostname)
        .bind(s.port)
        .bind(&s.username)
        .bind(&s.auth_method)
        .bind(&s.identity_file_path)
        .bind(&s.group_id)
        .bind(&s.notes)
        .bind(s.is_jump_host)
        .bind(&s.jump_host_id)
        .bind(&s.created_at)
        .bind(&s.updated_at)
        .execute(db)
        .await?
        .rows_affected();

        if n > 0 {
            servers_imported += 1;
        } else {
            servers_skipped += 1;
        }
    }

    for st in &backup.server_tags {
        sqlx::query("INSERT OR IGNORE INTO server_tags (server_id, tag_id) VALUES (?, ?)")
            .bind(&st.server_id)
            .bind(&st.tag_id)
            .execute(db)
            .await?;
    }

    // Refresh the in-memory server cache
    let fresh = queries::list_servers_db(db).await.unwrap_or_default();
    *state.server_cache.write().await = fresh;

    Ok(ImportSummary {
        servers_imported,
        groups_imported,
        tags_imported,
        servers_skipped,
    })
}
