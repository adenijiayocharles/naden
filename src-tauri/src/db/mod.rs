pub mod queries;

use crate::error::AppError;
use sqlx::{sqlite::SqlitePoolOptions, Executor, SqlitePool};
use std::path::{Path, PathBuf};

/// Single source of truth for where the vault DB file lives, given the app's
/// data directory — shared by `init_db` and the backup/restore commands so
/// they can never disagree on the filename.
pub(crate) fn db_file_path(data_dir: &Path) -> PathBuf {
    data_dir.join("naden.db")
}

/// The migrations this app ships, embedded at compile time. Exposed so
/// backup/restore can validate a candidate file exactly as a real app
/// launch would, without duplicating the embed (and risking the two
/// drifting if the migrations directory ever moves).
pub(crate) fn migrator() -> sqlx::migrate::Migrator {
    sqlx::migrate!("src/db/migrations")
}

pub async fn init_db(data_dir: PathBuf) -> Result<SqlitePool, AppError> {
    std::fs::create_dir_all(&data_dir)?;

    let db_path = db_file_path(&data_dir);
    let pre_migration_backup = data_dir.join("naden.db.pre-migration-backup");
    // Snapshot existence *before* we create the file via mode=rwc.
    let db_existed = db_path.exists();

    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

    // Single-user local desktop app: a handful of concurrent Tauri commands is
    // the realistic ceiling, not the sqlx default sizing meant for server workloads.
    // Each connection costs a parked OS thread (sqlx-sqlite dedicates one per
    // connection) plus its own page/statement cache, so keep this small for footprint.
    // foreign_keys is a per-connection SQLite pragma (unlike journal_mode, it
    // isn't persisted in the file) — every connection the pool ever opens needs
    // it set individually, or ON DELETE CASCADE silently no-ops on that connection.
    let pool = SqlitePoolOptions::new()
        .min_connections(1)
        .max_connections(4)
        .after_connect(|conn, _meta| {
            Box::pin(async move {
                conn.execute("PRAGMA foreign_keys = ON").await?;
                Ok(())
            })
        })
        .connect(&db_url)
        .await?;

    sqlx::query("PRAGMA journal_mode = WAL")
        .execute(&pool)
        .await?;

    // Back up before running migrations so a partial/failed migration can be
    // recovered. Only needed when a DB already exists (first launch has nothing
    // to lose). Checkpoint consolidates WAL frames into the main file first so
    // the copy is self-contained and consistent.
    if db_existed {
        sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
            .execute(&pool)
            .await?;
        std::fs::copy(&db_path, &pre_migration_backup)?;
    }

    if let Err(e) = migrator().run(&pool).await {
        if db_existed {
            // Close the pool before touching the file — sqlx keeps file locks
            // on the DB. Ignore the restore error: the backup is still at
            // pre_migration_backup for manual recovery if the copy below fails.
            pool.close().await;
            let _ = std::fs::copy(&pre_migration_backup, &db_path);
        }
        return Err(AppError::Database(e.to_string()));
    }

    Ok(pool)
}

#[cfg(test)]
mod tests;
