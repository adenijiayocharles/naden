use std::path::{Path, PathBuf};

use tauri::Manager;

use crate::db::queries;
use crate::error::AppError;
use crate::AppState;

fn live_db_path(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?;
    Ok(crate::db::db_file_path(&data_dir))
}

async fn remove_sidecar_files(db_path: &Path) {
    for suffix in ["-wal", "-shm"] {
        let mut sidecar = db_path.as_os_str().to_owned();
        sidecar.push(suffix);
        let _ = tokio::fs::remove_file(sidecar).await;
    }
}

/// Flushes the WAL into the main DB file, then copies it to `dest_path`.
/// The copy already contains every credential AES-256-GCM-encrypted exactly
/// as it sits on disk (see `vault::store_credential`) — no separate
/// encryption step is needed for the backup itself to be safe at rest.
#[tauri::command]
pub async fn backup_vault_db(
    app: tauri::AppHandle,
    dest_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(&state.db)
        .await?;

    let live_path = live_db_path(&app)?;
    tokio::fs::copy(&live_path, &dest_path)
        .await
        .map_err(|e| AppError::Io(e.to_string()))?;
    Ok(())
}

/// Validates `src_path` as a restorable naden vault, then swaps it in for the
/// live database. The running app must be relaunched afterwards (the
/// frontend does this via `relaunch()` on success) — `AppState.db` is a bare
/// `SqlitePool`, not behind a lock, so it can't be hot-swapped; requiring a
/// restart is the simplest design that can't leave the process holding a
/// stale pool.
#[tauri::command]
pub async fn restore_vault_db(
    app: tauri::AppHandle,
    src_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let live_path = live_db_path(&app)?;
    let data_dir = live_path
        .parent()
        .ok_or_else(|| AppError::Io("could not resolve the app data directory".into()))?;
    let staging_path = data_dir.join("naden.db.restore-staging");

    tokio::fs::copy(&src_path, &staging_path)
        .await
        .map_err(|e| AppError::Io(e.to_string()))?;

    if let Err(e) = validate_restore_candidate(&staging_path).await {
        let _ = tokio::fs::remove_file(&staging_path).await;
        remove_sidecar_files(&staging_path).await;
        return Err(e);
    }

    // Past this point the live pool is closed for the rest of the process —
    // every other in-flight or future command on it will start erroring, so
    // the frontend must relaunch regardless of whether the swap below
    // ultimately succeeds, fails, or fails-but-rolls-back. Only a
    // validate_restore_candidate failure above is safe to retry without
    // relaunching, since it never touches the pool or the live file.
    state.db.close().await;

    let backup_of_live = data_dir.join("naden.db.pre-restore-backup");
    swap_in_staged_db(&live_path, &staging_path, &backup_of_live).await
}

/// Renames `staging_path` into place as `live_path`, first moving any
/// existing `live_path` aside as `backup_of_live`. If the second rename
/// fails, rolls the first one back so the user's original DB ends up back at
/// `live_path` rather than missing — `init_db` would otherwise silently
/// "recover" a missing live path by creating a fresh empty vault.
async fn swap_in_staged_db(
    live_path: &Path,
    staging_path: &Path,
    backup_of_live: &Path,
) -> Result<(), AppError> {
    let _ = tokio::fs::remove_file(backup_of_live).await;
    let live_existed = tokio::fs::metadata(live_path).await.is_ok();
    if live_existed {
        tokio::fs::rename(live_path, backup_of_live)
            .await
            .map_err(|e| AppError::Io(e.to_string()))?;
    }
    if let Err(e) = tokio::fs::rename(staging_path, live_path).await {
        if live_existed {
            let _ = tokio::fs::rename(backup_of_live, live_path).await;
        }
        return Err(AppError::Io(e.to_string()));
    }
    remove_sidecar_files(staging_path).await;
    remove_sidecar_files(live_path).await;
    Ok(())
}

/// Opens the candidate file exactly as a real launch would (migrating it to
/// the latest schema), then re-runs the same per-row checks
/// create_server_db/update_server_db apply on every write. A restore writes
/// rows directly into place and bypasses those functions entirely, so without
/// this a crafted backup file could smuggle a `vault_credential_id` IDOR or an
/// `identity_file_path` SSH-config-injection payload straight past the
/// validation added for release_review.md #1/#2.
async fn validate_restore_candidate(path: &Path) -> Result<(), AppError> {
    let invalid =
        || AppError::Validation("the selected file is not a valid naden vault backup".into());

    let url = format!("sqlite:{}?mode=rw", path.display());
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .map_err(|_| invalid())?;

    crate::db::migrator()
        .run(&pool)
        .await
        .map_err(|_| invalid())?;
    validate_server_rows(&pool).await?;
    reject_duplicate_vault_credentials(&pool).await?;

    pool.close().await;
    Ok(())
}

async fn validate_server_rows(pool: &sqlx::SqlitePool) -> Result<(), AppError> {
    let rows: Vec<(String, String, String, Option<String>)> =
        sqlx::query_as("SELECT id, hostname, username, identity_file_path FROM servers")
            .fetch_all(pool)
            .await?;
    for (id, hostname, username, identity_file_path) in &rows {
        queries::validate_hostname(hostname).map_err(|_| {
            AppError::Validation(format!("backup has an invalid hostname for server {id}"))
        })?;
        queries::validate_username(username).map_err(|_| {
            AppError::Validation(format!("backup has an invalid username for server {id}"))
        })?;
        if let Some(p) = identity_file_path {
            queries::validate_identity_file_path(p).map_err(|_| {
                AppError::Validation(format!(
                    "backup has an invalid identity file path for server {id}"
                ))
            })?;
        }
    }
    Ok(())
}

/// Independent of whether the unique index from migration 0019 exists in the
/// candidate file — guards against an attacker forging `_sqlx_migrations`
/// bookkeeping (sqlx tracks applied migrations by checksum) to make the
/// migrator skip recreating that index on an older backup that already has
/// duplicate rows.
async fn reject_duplicate_vault_credentials(pool: &sqlx::SqlitePool) -> Result<(), AppError> {
    let duplicate: Option<String> = sqlx::query_scalar(
        "SELECT vault_credential_id FROM servers
         WHERE vault_credential_id IS NOT NULL
         GROUP BY vault_credential_id HAVING COUNT(*) > 1
         LIMIT 1",
    )
    .fetch_optional(pool)
    .await?;
    if duplicate.is_some() {
        return Err(AppError::Validation(
            "backup has servers sharing a vault credential — refusing to restore".into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
#[path = "backup_commands_tests.rs"]
mod tests;
