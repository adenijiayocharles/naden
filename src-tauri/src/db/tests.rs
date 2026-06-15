use super::*;

async fn test_pool() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .expect("failed to open in-memory db");

    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::migrate!("src/db/migrations")
        .run(&pool)
        .await
        .expect("migrations failed");

    pool
}

#[tokio::test]
async fn migrations_create_all_tables() {
    let pool = test_pool().await;

    let tables: Vec<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master \
         WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_sqlx_migrations' \
         ORDER BY name",
    )
    .fetch_all(&pool)
    .await
    .unwrap();

    assert!(
        tables.contains(&"groups".to_string()),
        "groups table missing"
    );
    assert!(
        tables.contains(&"servers".to_string()),
        "servers table missing"
    );
    assert!(tables.contains(&"tags".to_string()), "tags table missing");
    assert!(
        tables.contains(&"server_tags".to_string()),
        "server_tags table missing"
    );
}

#[tokio::test]
async fn indexes_are_created() {
    let pool = test_pool().await;

    let indexes: Vec<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name",
    )
    .fetch_all(&pool)
    .await
    .unwrap();

    assert!(
        indexes.contains(&"idx_servers_group".to_string()),
        "idx_servers_group missing"
    );
    assert!(
        indexes.contains(&"idx_servers_hostname".to_string()),
        "idx_servers_hostname missing"
    );
}

#[tokio::test]
async fn can_insert_and_query_server() {
    let pool = test_pool().await;

    sqlx::query(
        "INSERT INTO servers (id, display_name, hostname, created_at, updated_at) \
         VALUES ('s1', 'Prod Web', 'web.example.com', '2024-01-01T00:00:00', '2024-01-01T00:00:00')",
    )
    .execute(&pool)
    .await
    .unwrap();

    let name: String = sqlx::query_scalar("SELECT display_name FROM servers WHERE id = 's1'")
        .fetch_one(&pool)
        .await
        .unwrap();

    assert_eq!(name, "Prod Web");
}

#[tokio::test]
async fn cascade_delete_removes_server_tags() {
    let pool = test_pool().await;

    sqlx::query(
        "INSERT INTO servers (id, display_name, hostname, created_at, updated_at) \
         VALUES ('s1', 'Web', 'web.example.com', '2024-01-01T00:00:00', '2024-01-01T00:00:00')",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query("INSERT INTO tags (id, name) VALUES ('t1', 'production')")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query("INSERT INTO server_tags (server_id, tag_id) VALUES ('s1', 't1')")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query("DELETE FROM servers WHERE id = 's1'")
        .execute(&pool)
        .await
        .unwrap();

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM server_tags WHERE server_id = 's1'")
        .fetch_one(&pool)
        .await
        .unwrap();

    assert_eq!(count, 0, "server_tags not cascade-deleted");
}
