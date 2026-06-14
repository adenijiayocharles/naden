use crate::error::AppError;
use crate::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::Manager;
use uuid::Uuid;
use zeroize::{Zeroize, Zeroizing};

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

/// Row shape for `ssh_keys` SELECTs: (id, name, key_path, key_type, fingerprint, comment, is_encrypted, created_at, updated_at).
type SshKeyRow = (
    String,
    String,
    String,
    String,
    String,
    String,
    i64,
    String,
    String,
);

/// Deletes a temporary file on drop, ensuring askpass script cleanup on all code paths.
struct ScriptGuard(Option<std::path::PathBuf>);
impl Drop for ScriptGuard {
    fn drop(&mut self) {
        if let Some(p) = self.0.take() {
            let _ = std::fs::remove_file(p);
        }
    }
}

fn expand_path(path: &str, app: &tauri::AppHandle) -> std::path::PathBuf {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Ok(home) = app.path().home_dir() {
            return home.join(rest);
        }
    }
    std::path::PathBuf::from(path)
}

/// Rejects `..` components and paths outside the user's home directory.
fn validate_key_path(path: &std::path::Path, home: &std::path::Path) -> Result<(), AppError> {
    for component in path.components() {
        if component == std::path::Component::ParentDir {
            return Err(AppError::Validation(
                "key path must not contain '..' (parent directory traversal)".into(),
            ));
        }
    }
    if !path.starts_with(home) {
        return Err(AppError::Validation(
            "key path must be within your home directory".into(),
        ));
    }
    Ok(())
}

fn validate_name(name: &str) -> Result<(), AppError> {
    if name.is_empty() {
        return Err(AppError::Validation("name is required".into()));
    }
    if name.len() > 256 {
        return Err(AppError::Validation(
            "name must be 256 characters or fewer".into(),
        ));
    }
    if name.contains('\0') {
        return Err(AppError::Validation(
            "name contains invalid characters".into(),
        ));
    }
    Ok(())
}

/// Writes a minimal printf-based askpass script to a mode-0700 temp file so that
/// ssh-keygen reads the passphrase from a helper instead of a process argument.
/// Passphrase in process arguments is visible to all local users via `ps aux`.
fn write_askpass_script(passphrase: &str) -> Result<std::path::PathBuf, AppError> {
    use std::io::Write as _;
    use std::os::unix::fs::OpenOptionsExt as _;

    let path = std::env::temp_dir().join(format!(".sshelter_{}", Uuid::new_v4()));
    let mut f = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o700) // owner-only read + execute
        .open(&path)
        .map_err(|e| AppError::Io(format!("cannot create askpass script: {e}")))?;

    // Escape any embedded single-quotes for safe shell quoting.
    let escaped = passphrase.replace('\'', r"'\''");
    writeln!(f, "#!/bin/sh\nprintf '%s' '{}'", escaped)
        .map_err(|e| AppError::Io(format!("cannot write askpass script: {e}")))?;

    Ok(path)
}

/// Extracts key type, fingerprint, comment, and encryption status from a private key file.
///
/// `home` is used to reject symlink escapes when reading the companion .pub file.
/// Runs blocking I/O synchronously — callers must use `tokio::task::spawn_blocking`.
fn inspect_key(priv_path: &std::path::Path, home: &std::path::Path) -> Result<KeyMeta, AppError> {
    // Wrap in Zeroizing so key material is wiped from the heap on drop.
    let priv_data: Zeroizing<String> = Zeroizing::new(
        std::fs::read_to_string(priv_path)
            .map_err(|e| AppError::Io(format!("cannot read key file: {e}")))?,
    );

    if !priv_data.contains("PRIVATE KEY") {
        return Err(AppError::Validation(
            "file does not appear to be a private key".into(),
        ));
    }

    let is_encrypted = crate::ssh::connection::key_is_encrypted(&priv_data);

    let pub_path = {
        let name = priv_path
            .file_name()
            .map(|n| format!("{}.pub", n.to_string_lossy()))
            .unwrap_or_default();
        priv_path.parent().unwrap_or(priv_path).join(name)
    };
    // Cache to avoid a second stat syscall later.
    let pub_exists = pub_path.exists();

    let keygen_source = if pub_exists {
        pub_path.clone()
    } else {
        priv_path.to_path_buf()
    };

    let (fingerprint, key_type) = match std::process::Command::new("ssh-keygen")
        .args(["-l", "-f", &keygen_source.to_string_lossy()])
        .output()
    {
        Ok(out) if out.status.success() => {
            let line = String::from_utf8_lossy(&out.stdout);
            // Format: "256 SHA256:xxx...= comment (ED25519)"
            let parts: Vec<&str> = line.split_whitespace().collect();
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

    // Canonicalize the .pub path to catch symlinks that escape the home directory
    // before reading it for the comment field.
    let comment = if pub_exists {
        std::fs::canonicalize(&pub_path)
            .ok()
            .filter(|canon| canon.starts_with(home))
            .and_then(|canon| std::fs::read_to_string(canon).ok())
            .and_then(|s| {
                let parts: Vec<&str> = s.trim().splitn(3, ' ').collect();
                parts.get(2).map(|c| c.trim().to_string())
            })
            .unwrap_or_default()
    } else {
        String::new()
    };

    Ok(KeyMeta {
        key_type,
        fingerprint,
        comment,
        is_encrypted,
    })
}

#[tauri::command]
pub async fn list_ssh_keys(state: tauri::State<'_, AppState>) -> Result<Vec<SshKey>, AppError> {
    let rows: Vec<SshKeyRow> = sqlx::query_as(
        "SELECT id, name, key_path, key_type, fingerprint, comment, is_encrypted, \
             created_at, updated_at FROM ssh_keys ORDER BY created_at ASC",
    )
    .fetch_all(&state.db)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(
                id,
                name,
                key_path,
                key_type,
                fingerprint,
                comment,
                is_encrypted,
                created_at,
                updated_at,
            )| {
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
    let home = app
        .path()
        .home_dir()
        .map_err(|e| AppError::Io(e.to_string()))?;
    validate_key_path(&expanded, &home)?;

    // Move blocking I/O (file read + ssh-keygen subprocess) off the Tokio worker thread.
    let home_owned = home.clone();
    let meta = tokio::task::spawn_blocking(move || inspect_key(&expanded, &home_owned))
        .await
        .map_err(|e| AppError::Ssh(format!("background task failed: {e}")))??;

    let key_name = name.filter(|n| !n.trim().is_empty()).unwrap_or_else(|| {
        expand_path(&path, &app)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Unnamed Key".into())
    });
    validate_name(key_name.trim())?;

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO ssh_keys \
         (id, name, key_path, key_type, fingerprint, comment, is_encrypted, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(key_name.trim())
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
        name: key_name.trim().to_string(),
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
pub async fn remove_ssh_key(state: tauri::State<'_, AppState>, id: String) -> Result<(), AppError> {
    let result = sqlx::query("DELETE FROM ssh_keys WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("key '{id}' not found")));
    }
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
    validate_name(name.trim())?;
    if output_path.trim().is_empty() {
        return Err(AppError::Validation("output path is required".into()));
    }

    let expanded = expand_path(&output_path, &app);
    let home = app
        .path()
        .home_dir()
        .map_err(|e| AppError::Io(e.to_string()))?;
    validate_key_path(&expanded, &home)?;

    let name_c = name.trim().to_string();
    let output_path_c = output_path.clone();

    // Run all blocking operations (fs, ssh-keygen subprocess) off the Tokio worker thread.
    let meta = tokio::task::spawn_blocking(move || -> Result<KeyMeta, AppError> {
        if expanded.exists() {
            return Err(AppError::Validation(format!(
                "file already exists: {output_path_c}"
            )));
        }
        if let Some(parent) = expanded.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let mut pass = passphrase.unwrap_or_default();

        let (t_arg, bits): (&str, Option<&str>) = match key_type.as_str() {
            "rsa" => ("rsa", Some("4096")),
            "ecdsa" => ("ecdsa", Some("521")),
            _ => ("ed25519", None),
        };

        let mut cmd = std::process::Command::new("ssh-keygen");
        cmd.args([
            "-t",
            t_arg,
            "-C",
            &name_c,
            "-f",
            &expanded.to_string_lossy(),
        ]);
        if let Some(b) = bits {
            cmd.args(["-b", b]);
        }

        // Avoid the passphrase appearing in process arguments (visible via `ps aux`).
        // When a passphrase is set, use SSH_ASKPASS so ssh-keygen calls our helper
        // script instead of reading from the terminal. ScriptGuard deletes the file
        // on drop regardless of whether we return Ok or Err below.
        let _guard = if pass.is_empty() {
            cmd.arg("-N").arg("");
            ScriptGuard(None)
        } else {
            let script = write_askpass_script(&pass)?;
            cmd.env("SSH_ASKPASS", &script)
                .env("SSH_ASKPASS_REQUIRE", "force") // OpenSSH >= 8.4
                .env("DISPLAY", "dummy") // fallback for older OpenSSH
                .stdin(std::process::Stdio::null());
            ScriptGuard(Some(script))
        };
        pass.zeroize();

        let out = cmd
            .output()
            .map_err(|e| AppError::Ssh(format!("ssh-keygen not available: {e}")))?;

        if !out.status.success() {
            log::error!(
                "ssh-keygen failed: {}",
                String::from_utf8_lossy(&out.stderr)
            );
            return Err(AppError::Ssh("key generation failed".into()));
        }

        inspect_key(&expanded, &home)
    })
    .await
    .map_err(|e| AppError::Ssh(format!("background task failed: {e}")))??;

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
    let key_path: Option<String> = sqlx::query_scalar("SELECT key_path FROM ssh_keys WHERE id = ?")
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

    // Canonicalize to follow any symlinks and then verify the resolved path is still
    // under the home directory, preventing a symlink-based arbitrary file read.
    let home = app
        .path()
        .home_dir()
        .map_err(|e| AppError::Io(e.to_string()))?;
    let canon = std::fs::canonicalize(&pub_path).map_err(|_| {
        AppError::NotFound(format!("public key not found at {}", pub_path.display()))
    })?;
    if !canon.starts_with(&home) {
        return Err(AppError::Validation(
            "public key path resolves outside home directory".into(),
        ));
    }

    Ok(tokio::fs::read_to_string(&canon).await?)
}

/// Renames a managed key in the registry (does not touch the file on disk).
#[tauri::command]
pub async fn rename_ssh_key(
    state: tauri::State<'_, AppState>,
    id: String,
    name: String,
) -> Result<SshKey, AppError> {
    validate_name(name.trim())?;
    let now = Utc::now().to_rfc3339();

    // RETURNING eliminates the separate SELECT round-trip and makes the
    // update+fetch atomic — RowNotFound if the id doesn't exist.
    let row: (
        String,
        String,
        String,
        String,
        String,
        String,
        i64,
        String,
        String,
    ) = sqlx::query_as(
        "UPDATE ssh_keys SET name = ?, updated_at = ? WHERE id = ? \
             RETURNING id, name, key_path, key_type, fingerprint, comment, \
             is_encrypted, created_at, updated_at",
    )
    .bind(name.trim())
    .bind(&now)
    .bind(&id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| match e {
        sqlx::Error::RowNotFound => AppError::NotFound(format!("key '{id}' not found")),
        _ => AppError::from(e),
    })?;

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
