use super::*;
use sqlx::sqlite::SqlitePoolOptions;

async fn temp_db_path() -> PathBuf {
    std::env::temp_dir().join(format!("naden_backup_test_{}.db", uuid::Uuid::new_v4()))
}

/// A freshly migrated, empty DB — what a real `backup_vault_db` output looks like.
async fn migrated_pool(path: &Path) -> sqlx::SqlitePool {
    let pool = SqlitePoolOptions::new()
        .connect(&format!("sqlite:{}?mode=rwc", path.display()))
        .await
        .unwrap();
    crate::db::migrator().run(&pool).await.unwrap();
    pool
}

fn cleanup(path: &Path) {
    let _ = std::fs::remove_file(path);
    let mut wal = path.as_os_str().to_owned();
    wal.push("-wal");
    let _ = std::fs::remove_file(wal);
    let mut shm = path.as_os_str().to_owned();
    shm.push("-shm");
    let _ = std::fs::remove_file(shm);
}

#[tokio::test]
async fn accepts_a_freshly_migrated_empty_db() {
    let path = temp_db_path().await;
    migrated_pool(&path).await.close().await;

    let result = validate_restore_candidate(&path).await;
    cleanup(&path);

    assert!(result.is_ok());
}

#[tokio::test]
async fn rejects_a_file_that_is_not_a_sqlite_database() {
    let path = temp_db_path().await;
    std::fs::write(&path, b"not a sqlite file").unwrap();

    let result = validate_restore_candidate(&path).await;
    cleanup(&path);

    assert!(matches!(result, Err(AppError::Validation(_))));
}

#[tokio::test]
async fn rejects_a_server_row_with_newline_injected_identity_file_path() {
    // Simulates a malicious/corrupted backup file where the row was written
    // directly via raw SQL, bypassing create_server_db/update_server_db's
    // validation entirely — this is exactly the bypass restore must guard
    // against (release_review.md #2).
    let path = temp_db_path().await;
    let pool = migrated_pool(&path).await;
    sqlx::query(
        "INSERT INTO servers (id, display_name, hostname, identity_file_path, created_at, updated_at)
         VALUES ('s1', 'Evil', 'evil.example.com', '/k\nProxyCommand evil', '2024-01-01', '2024-01-01')",
    )
    .execute(&pool)
    .await
    .unwrap();
    pool.close().await;

    let result = validate_restore_candidate(&path).await;
    cleanup(&path);

    assert!(matches!(result, Err(AppError::Validation(_))));
}

#[tokio::test]
async fn rejects_a_hostname_with_shell_metacharacters() {
    let path = temp_db_path().await;
    let pool = migrated_pool(&path).await;
    sqlx::query(
        "INSERT INTO servers (id, display_name, hostname, created_at, updated_at)
         VALUES ('s1', 'Evil', 'evil; rm -rf ~', '2024-01-01', '2024-01-01')",
    )
    .execute(&pool)
    .await
    .unwrap();
    pool.close().await;

    let result = validate_restore_candidate(&path).await;
    cleanup(&path);

    assert!(matches!(result, Err(AppError::Validation(_))));
}

#[tokio::test]
async fn reject_duplicate_vault_credentials_catches_shared_credential_ids() {
    // A real, fully migrated DB can never reach this state — migration
    // 0019's unique index stops the second insert outright. This test
    // exercises reject_duplicate_vault_credentials directly against a
    // hand-built table that lacks that index, simulating the one way a
    // restore could still reach this state: an attacker forging
    // `_sqlx_migrations` bookkeeping so the migrator skips recreating the
    // index on an older backup that already has duplicate rows.
    let pool = SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::query("CREATE TABLE servers (id TEXT PRIMARY KEY, vault_credential_id TEXT)")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO servers (id, vault_credential_id) VALUES ('s1', 'shared-cred')")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO servers (id, vault_credential_id) VALUES ('s2', 'shared-cred')")
        .execute(&pool)
        .await
        .unwrap();

    let result = reject_duplicate_vault_credentials(&pool).await;

    assert!(matches!(result, Err(AppError::Validation(_))));
}

#[tokio::test]
async fn reject_duplicate_vault_credentials_accepts_distinct_or_null_ids() {
    let pool = SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::query("CREATE TABLE servers (id TEXT PRIMARY KEY, vault_credential_id TEXT)")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO servers (id, vault_credential_id) VALUES ('s1', 'cred-a')")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO servers (id, vault_credential_id) VALUES ('s2', NULL)")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO servers (id, vault_credential_id) VALUES ('s3', NULL)")
        .execute(&pool)
        .await
        .unwrap();

    let result = reject_duplicate_vault_credentials(&pool).await;

    assert!(result.is_ok());
}

fn temp_plain_path(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!("naden_swap_test_{}_{name}", uuid::Uuid::new_v4()))
}

#[tokio::test]
async fn swap_in_staged_db_moves_staging_into_place_and_keeps_a_backup() {
    let live = temp_plain_path("live");
    let staging = temp_plain_path("staging");
    let backup = temp_plain_path("backup");
    std::fs::write(&live, b"original data").unwrap();
    std::fs::write(&staging, b"restored data").unwrap();

    let result = swap_in_staged_db(&live, &staging, &backup).await;

    assert!(result.is_ok());
    assert_eq!(std::fs::read(&live).unwrap(), b"restored data");
    assert_eq!(std::fs::read(&backup).unwrap(), b"original data");
    cleanup(&live);
    cleanup(&backup);
}

#[tokio::test]
async fn swap_in_staged_db_rolls_back_when_the_final_rename_fails() {
    // Point staging at a file that doesn't exist, to deterministically force
    // the second rename to fail without needing to fake a disk error.
    let live = temp_plain_path("live");
    let missing_staging = temp_plain_path("missing-staging");
    let backup = temp_plain_path("backup");
    std::fs::write(&live, b"original data").unwrap();

    let result = swap_in_staged_db(&live, &missing_staging, &backup).await;

    assert!(result.is_err());
    assert_eq!(std::fs::read(&live).unwrap(), b"original data");
    assert!(!backup.exists());
    cleanup(&live);
}

#[tokio::test]
async fn swap_in_staged_db_handles_no_prior_live_file() {
    let live = temp_plain_path("live");
    let staging = temp_plain_path("staging");
    let backup = temp_plain_path("backup");
    std::fs::write(&staging, b"first ever vault").unwrap();

    let result = swap_in_staged_db(&live, &staging, &backup).await;

    assert!(result.is_ok());
    assert_eq!(std::fs::read(&live).unwrap(), b"first ever vault");
    assert!(!backup.exists());
    cleanup(&live);
}
