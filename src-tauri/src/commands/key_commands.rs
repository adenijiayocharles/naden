use crate::error::AppError;
use crate::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SshKey {
    pub id: String,
    pub name: String,
    pub key_path: String,
    pub key_type: String,
    pub fingerprint: String,
    pub comment: String,
    pub is_encrypted: bool,
    pub created_at: String,
    pub updated_at: String,
}

struct KeyMeta {
    key_type: String,
    fingerprint: String,
    comment: String,
    is_encrypted: bool,
}

fn expand_path(path: &str, app: &tauri::AppHandle) -> std::path::PathBuf {
    use tauri::Manager;
    if let Some(rest) = path.strip_prefix("~/") {
        if let Ok(home) = app.path().home_dir() {
            return home.join(rest);
        }
    }
    std::path::PathBuf::from(path)
}

/// Derives key type, fingerprint, comment, and encryption status from a private key file.
fn inspect_key(priv_path: &std::path::Path) -> Result<KeyMeta, AppError> {
    let priv_data = std::fs::read_to_string(priv_path)
        .map_err(|e| AppError::Io(format!("cannot read key file: {e}")))?;

    if !priv_data.contains("PRIVATE KEY") {
        return Err(AppError::Validation(
            "file does not appear to be a private key".into(),
        ));
    }

    let is_encrypted = crate::ssh::connection::key_is_encrypted(&priv_data);

    // Derive the companion .pub path (e.g. id_ed25519 → id_ed25519.pub)
    let pub_path = {
        let name = priv_path
            .file_name()
            .map(|n| format!("{}.pub", n.to_string_lossy()))
            .unwrap_or_default();
        priv_path.parent().unwrap_or(priv_path).join(name)
    };

    // ssh-keygen -l works on both the private key and the .pub file.
    // Prefer the .pub file so we don't need the passphrase.
    let keygen_source = if pub_path.exists() {
        pub_path.clone()
    } else {
        priv_path.to_path_buf()
    };

    let (fingerprint, key_type) =
        match std::process::Command::new("ssh-keygen")
            .args(["-l", "-f", &keygen_source.to_string_lossy()])
            .output()
        {
            Ok(out) if out.status.success() => {
                let line = String::from_utf8_lossy(&out.stdout);
                // Format: "256 SHA256:xxx...= comment (ED25519)"
                let parts: Vec<&str> = line.trim().split_whitespace().collect();
                let fp = parts.get(1).copied().unwrap_or("").to_string();
                let kt = parts
                    .last()
                    .map(|s| s.trim_matches(|c| c == '(' || c == ')'))
                    .map(|s| match s.to_lowercase().as_str() {
                        "ed25519" => "ed25519",
                        "ecdsa" => "ecdsa",
                        "rsa" => "rsa",
                        "dsa" | "dss" => "dsa",
                        _ => "unknown",
                    })
                    .unwrap_or("unknown")
                    .to_string();
                (fp, kt)
            }
            _ => {
                // Fallback: detect type from PEM header (best effort, no fingerprint)
                let kt = if priv_data.contains("BEGIN EC PRIVATE KEY") {
                    "ecdsa"
                } else if priv_data.contains("BEGIN RSA PRIVATE KEY") {
                    "rsa"
                } else if priv_data.contains("BEGIN DSA PRIVATE KEY") {
                    "dsa"
                } else {
                    "unknown"
                }
                .to_string();
                ("".to_string(), kt)
            }
        };

    // Comment is the third field of the .pub line
    let comment = pub_path
        .exists()
        .then(|| std::fs::read_to_string(&pub_path).ok())
        .flatten()
        .and_then(|s| {
            let parts: Vec<&str> = s.trim().splitn(3, ' ').collect();
            parts.get(2).map(|c| c.trim().to_string())
        })
        .unwrap_or_default();

    Ok(KeyMeta {
        key_type,
        fingerprint,
        comment,
        is_encrypted,
    })
}

#[tauri::command]
pub async fn list_ssh_keys(state: tauri::State<'_, AppState>) -> Result<Vec<SshKey>, AppError> {
    let rows: Vec<(String, String, String, String, String, String, i64, String, String)> =
        sqlx::query_as(
            "SELECT id, name, key_path, key_type, fingerprint, comment, is_encrypted, \
             created_at, updated_at FROM ssh_keys ORDER BY created_at ASC",
        )
        .fetch_all(&state.db)
        .await?;

    Ok(rows
        .into_iter()
        .map(
            |(id, name, key_path, key_type, fingerprint, comment, is_encrypted, created_at, updated_at)| {
                SshKey {
                    id,
                    name,
                    key_path,
                    key_type,
                    fingerprint,
                    comment,
                    is_encrypted: is_encrypted != 0,
                    created_at,
                    updated_at,
                }
            },
        )
        .collect())
}

#[tauri::command]
pub async fn add_ssh_key(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    path: String,
    name: Option<String>,
) -> Result<SshKey, AppError> {
    let expanded = expand_path(&path, &app);
    let meta = inspect_key(&expanded)?;

    let key_name = name.unwrap_or_else(|| {
        expanded
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Unnamed Key".into())
    });

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO ssh_keys \
         (id, name, key_path, key_type, fingerprint, comment, is_encrypted, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&key_name)
    .bind(&path)
    .bind(&meta.key_type)
    .bind(&meta.fingerprint)
    .bind(&meta.comment)
    .bind(meta.is_encrypted as i32)
    .bind(&now)
    .bind(&now)
    .execute(&state.db)
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(ref db) if db.message().contains("UNIQUE") => {
            AppError::Validation(format!("key at '{path}' is already in the vault"))
        }
        _ => AppError::from(e),
    })?;

    Ok(SshKey {
        id,
        name: key_name,
        key_path: path,
        key_type: meta.key_type,
        fingerprint: meta.fingerprint,
        comment: meta.comment,
        is_encrypted: meta.is_encrypted,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub async fn remove_ssh_key(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    sqlx::query("DELETE FROM ssh_keys WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn generate_ssh_key(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    name: String,
    key_type: String,
    output_path: String,
    passphrase: Option<String>,
) -> Result<SshKey, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("name is required".into()));
    }
    if output_path.trim().is_empty() {
        return Err(AppError::Validation("output path is required".into()));
    }

    let expanded = expand_path(&output_path, &app);

    if expanded.exists() {
        return Err(AppError::Validation(format!(
            "file already exists: {output_path}"
        )));
    }

    // Ensure parent directory exists
    if let Some(parent) = expanded.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let (t_arg, bits): (&str, Option<&str>) = match key_type.as_str() {
        "rsa" => ("rsa", Some("4096")),
        "ecdsa" => ("ecdsa", Some("521")),
        _ => ("ed25519", None),
    };

    let passphrase_str = passphrase.as_deref().unwrap_or("");

    let mut cmd = std::process::Command::new("ssh-keygen");
    cmd.args([
        "-t",
        t_arg,
        "-C",
        name.trim(),
        "-f",
        &expanded.to_string_lossy(),
        "-N",
        passphrase_str,
    ]);
    if let Some(b) = bits {
        cmd.args(["-b", b]);
    }

    let out = cmd
        .output()
        .map_err(|e| AppError::Ssh(format!("ssh-keygen not available: {e}")))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(AppError::Ssh(format!("key generation failed: {stderr}")));
    }

    // Inspect the freshly generated key for metadata
    let meta = inspect_key(&expanded)?;

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO ssh_keys \
         (id, name, key_path, key_type, fingerprint, comment, is_encrypted, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(name.trim())
    .bind(&output_path)
    .bind(&meta.key_type)
    .bind(&meta.fingerprint)
    .bind(&meta.comment)
    .bind(meta.is_encrypted as i32)
    .bind(&now)
    .bind(&now)
    .execute(&state.db)
    .await?;

    Ok(SshKey {
        id,
        name: name.trim().to_string(),
        key_path: output_path,
        key_type: meta.key_type,
        fingerprint: meta.fingerprint,
        comment: meta.comment,
        is_encrypted: meta.is_encrypted,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// Returns the contents of the companion .pub file for a registered key.
#[tauri::command]
pub async fn get_public_key(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<String, AppError> {
    let key_path: Option<String> =
        sqlx::query_scalar("SELECT key_path FROM ssh_keys WHERE id = ?")
            .bind(&id)
            .fetch_optional(&state.db)
            .await?;

    let path = key_path.ok_or_else(|| AppError::NotFound(format!("key '{id}' not found")))?;

    let expanded = expand_path(&path, &app);
    let pub_path = {
        let name = expanded
            .file_name()
            .map(|n| format!("{}.pub", n.to_string_lossy()))
            .unwrap_or_default();
        expanded.parent().unwrap_or(&expanded).join(name)
    };

    if !pub_path.exists() {
        return Err(AppError::NotFound(format!(
            "public key not found at {}",
            pub_path.display()
        )));
    }

    Ok(std::fs::read_to_string(&pub_path)?)
}

/// Renames a managed key in the registry (does not touch the file on disk).
#[tauri::command]
pub async fn rename_ssh_key(
    state: tauri::State<'_, AppState>,
    id: String,
    name: String,
) -> Result<SshKey, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("name is required".into()));
    }
    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE ssh_keys SET name = ?, updated_at = ? WHERE id = ?")
        .bind(name.trim())
        .bind(&now)
        .bind(&id)
        .execute(&state.db)
        .await?;

    let row: (String, String, String, String, String, String, i64, String, String) =
        sqlx::query_as(
            "SELECT id, name, key_path, key_type, fingerprint, comment, is_encrypted, \
             created_at, updated_at FROM ssh_keys WHERE id = ?",
        )
        .bind(&id)
        .fetch_one(&state.db)
        .await?;

    let (id, name, key_path, key_type, fingerprint, comment, is_encrypted, created_at, updated_at) =
        row;
    Ok(SshKey {
        id,
        name,
        key_path,
        key_type,
        fingerprint,
        comment,
        is_encrypted: is_encrypted != 0,
        created_at,
        updated_at,
    })
}
