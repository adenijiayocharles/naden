use super::*;

async fn make_db() -> SqlitePool {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::query("CREATE TABLE vault_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)")
        .execute(&pool)
        .await
        .unwrap();
    pool
}

#[tokio::test]
async fn is_not_set_up_before_setup() {
    let db = make_db().await;
    assert!(!is_setup(&db).await.unwrap());
}

#[tokio::test]
async fn is_set_up_after_setup() {
    let db = make_db().await;
    setup(&db, "correct-horse-battery").await.unwrap();
    assert!(is_setup(&db).await.unwrap());
}

#[tokio::test]
async fn verify_correct_password_returns_key() {
    let db = make_db().await;
    setup(&db, "my-secret-pass").await.unwrap();
    let result = verify(&db, "my-secret-pass").await.unwrap();
    assert!(result.is_some());
}

#[tokio::test]
async fn verify_wrong_password_returns_none() {
    let db = make_db().await;
    setup(&db, "correct-pass").await.unwrap();
    let result = verify(&db, "wrong-pass").await.unwrap();
    assert!(result.is_none());
}

#[tokio::test]
async fn verify_upgrades_legacy_rounds_transparently() {
    let db = make_db().await;
    let password = "legacy-password";

    // Manually insert a vault set up with LEGACY_ROUNDS
    let salt = generate_salt().unwrap();
    let legacy_key = derive_key_with_rounds(password, &salt, LEGACY_ROUNDS);
    let legacy_verification = sha256_verification_hash(&legacy_key);
    sqlx::query("INSERT INTO vault_meta (key, value) VALUES ('pbkdf2_salt', ?)")
        .bind(STANDARD.encode(salt))
        .execute(&db)
        .await
        .unwrap();
    sqlx::query("INSERT INTO vault_meta (key, value) VALUES ('verification', ?)")
        .bind(STANDARD.encode(legacy_verification))
        .execute(&db)
        .await
        .unwrap();

    // verify() should accept the password and re-hash at current rounds
    let result = verify(&db, password).await.unwrap();
    assert!(result.is_some());

    // A second verify should now succeed with the re-hashed verification
    let result2 = verify(&db, password).await.unwrap();
    assert!(result2.is_some());
}

#[tokio::test]
async fn password_not_required_after_set_password_required_false() {
    let db = make_db().await;
    setup(&db, "pass").await.unwrap();
    // Simulate what vault_disable_password does: remove PBKDF2 meta + mark not required.
    sqlx::query("DELETE FROM vault_meta WHERE key IN ('pbkdf2_salt', 'verification')")
        .execute(&db)
        .await
        .unwrap();
    set_password_required(&db, false).await.unwrap();

    assert!(!is_password_required(&db).await.unwrap());
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM vault_meta WHERE key = 'pbkdf2_salt'")
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(count, 0);
}

#[tokio::test]
async fn is_setup_returns_true_when_password_not_required() {
    let db = make_db().await;
    set_password_required(&db, false).await.unwrap();
    // No salt exists, but password is not required — vault is considered set up
    assert!(is_setup(&db).await.unwrap());
}

#[tokio::test]
async fn set_password_required_persists() {
    let db = make_db().await;
    assert!(is_password_required(&db).await.unwrap()); // default true
    set_password_required(&db, false).await.unwrap();
    assert!(!is_password_required(&db).await.unwrap());
    set_password_required(&db, true).await.unwrap();
    assert!(is_password_required(&db).await.unwrap());
}

#[tokio::test]
async fn returned_keys_are_consistent_across_verify_calls() {
    let db = make_db().await;
    let key1 = setup(&db, "stable-pass").await.unwrap();
    let key2 = verify(&db, "stable-pass").await.unwrap().unwrap();
    // Both derived from the same password + stored salt — must be equal
    assert_eq!(key1.as_slice(), key2.as_slice());
}
