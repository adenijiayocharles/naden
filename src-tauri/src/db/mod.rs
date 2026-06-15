pub mod queries;

use crate::error::AppError;
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::path::PathBuf;

pub async fn init_db(data_dir: PathBuf) -> Result<SqlitePool, AppError> {
    std::fs::create_dir_all(&data_dir)?;

    let db_path = data_dir.join("naden.db");
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

    sqlx::migrate!("src/db/migrations")
        .run(&pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(pool)
}

#[cfg(test)]
mod tests;
