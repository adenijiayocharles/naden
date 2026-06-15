use super::*;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

async fn make_db() -> sqlx::SqlitePool {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::query("CREATE TABLE vault_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)")
        .execute(&pool)
        .await
        .unwrap();
    pool
}

#[tokio::test]
async fn load_lockout_returns_zero_on_empty_db() {
    let db = make_db().await;
    let (failures, until) = load_lockout(&db).await;
    assert_eq!(failures, 0);
    assert!(until.is_none());
}

#[tokio::test]
async fn persist_and_reload_failure_count() {
    let db = make_db().await;
    persist_lockout(&db, 3, None).await;
    let (failures, until) = load_lockout(&db).await;
    assert_eq!(failures, 3);
    assert!(until.is_none());
}

#[tokio::test]
async fn persist_and_reload_lockout_expiry() {
    let db = make_db().await;
    let expiry = SystemTime::now() + Duration::from_secs(3600);
    persist_lockout(&db, 5, Some(expiry)).await;
    let (_, until) = load_lockout(&db).await;
    let loaded = until.expect("expiry should be present");
    let diff = loaded
        .duration_since(expiry)
        .unwrap_or_else(|e| e.duration());
    assert!(diff < Duration::from_secs(1));
}

#[tokio::test]
async fn load_lockout_discards_expired_lockout() {
    let db = make_db().await;
    let past = UNIX_EPOCH + Duration::from_secs(1);
    persist_lockout(&db, 5, Some(past)).await;
    let (failures, until) = load_lockout(&db).await;
    assert_eq!(failures, 5);
    assert!(until.is_none());
}

#[tokio::test]
async fn persist_lockout_zero_clears_state() {
    let db = make_db().await;
    let future = SystemTime::now() + Duration::from_secs(3600);
    persist_lockout(&db, 3, Some(future)).await;
    persist_lockout(&db, 0, None).await;
    let (failures, until) = load_lockout(&db).await;
    assert_eq!(failures, 0);
    assert!(until.is_none());
}
