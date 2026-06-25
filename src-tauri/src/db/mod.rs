pub mod queries;

use crate::error::AppError;
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
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
    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

    let pool = SqlitePoolOptions::new()
        .min_connections(2)
        .max_connections(10)
        .connect(&db_url)
        .await?;

    sqlx::query("PRAGMA journal_mode = WAL")
        .execute(&pool)
        .await?;
    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(&pool)
        .await?;

    migrator()
        .run(&pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(pool)
}

#[cfg(test)]
mod tests;
