use super::*;

async fn make_pool() -> SqlitePool {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::migrate!("src/db/migrations")
        .run(&pool)
        .await
        .unwrap();
    pool
}

fn key(byte: u8) -> [u8; 32] {
    [byte; 32]
}

#[tokio::test]
async fn store_and_retrieve_round_trip() {
    let db = make_pool().await;
    let id = store_credential(&db, &key(1), "s3cret").await.unwrap();
    let secret = retrieve_credential(&db, &key(1), &id).await.unwrap();
    assert_eq!(secret, "s3cret");
}

#[tokio::test]
async fn update_credential_replaces_secret() {
    let db = make_pool().await;
    let id = store_credential(&db, &key(1), "old-secret").await.unwrap();
    update_credential(&db, &key(1), &id, "new-secret")
        .await
        .unwrap();
    let secret = retrieve_credential(&db, &key(1), &id).await.unwrap();
    assert_eq!(secret, "new-secret");
}

#[tokio::test]
async fn delete_credential_removes_row() {
    let db = make_pool().await;
    let id = store_credential(&db, &key(1), "s3cret").await.unwrap();
    delete_credential(&db, &id).await.unwrap();
    let result = retrieve_credential(&db, &key(1), &id).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn retrieve_with_corrupt_nonce_is_rejected() {
    let db = make_pool().await;
    let id = store_credential(&db, &key(1), "s3cret").await.unwrap();

    sqlx::query("UPDATE vault_credentials SET nonce = ? WHERE id = ?")
        .bind(vec![0u8; 8])
        .bind(&id)
        .execute(&db)
        .await
        .unwrap();

    let result = retrieve_credential(&db, &key(1), &id).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn retrieve_with_wrong_key_fails() {
    let db = make_pool().await;
    let id = store_credential(&db, &key(1), "s3cret").await.unwrap();
    let result = retrieve_credential(&db, &key(2), &id).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn reencrypt_all_migrates_to_new_key() {
    let db = make_pool().await;
    let id1 = store_credential(&db, &key(1), "secret-one").await.unwrap();
    let id2 = store_credential(&db, &key(1), "secret-two").await.unwrap();

    reencrypt_all(&db, &key(1), &key(2)).await.unwrap();

    assert_eq!(
        retrieve_credential(&db, &key(2), &id1).await.unwrap(),
        "secret-one"
    );
    assert_eq!(
        retrieve_credential(&db, &key(2), &id2).await.unwrap(),
        "secret-two"
    );
    assert!(retrieve_credential(&db, &key(1), &id1).await.is_err());
}
