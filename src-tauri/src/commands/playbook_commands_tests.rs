use super::*;
use sqlx::sqlite::SqlitePoolOptions;

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

fn step(command: &str, delay_ms: i64) -> StepInput {
    StepInput {
        command: command.to_string(),
        delay_ms,
    }
}

#[tokio::test]
async fn create_playbook_persists_steps_in_order() {
    let db = test_pool().await;
    let payload = CreatePlaybookPayload {
        title: "Restart nginx".into(),
        description: None,
        steps: vec![
            step("sudo systemctl stop nginx", 200),
            step("sudo systemctl start nginx", 500),
        ],
    };

    let created = create_playbook_db(&db, &payload).await.unwrap();

    assert_eq!(
        created
            .steps
            .iter()
            .map(|s| s.command.as_str())
            .collect::<Vec<_>>(),
        vec!["sudo systemctl stop nginx", "sudo systemctl start nginx"]
    );
}

#[tokio::test]
async fn list_playbooks_returns_steps_ordered_by_position() {
    let db = test_pool().await;
    create_playbook_db(
        &db,
        &CreatePlaybookPayload {
            title: "Deploy".into(),
            description: Some("Pulls and restarts".into()),
            steps: vec![
                step("git pull", 100),
                step("make build", 100),
                step("make restart", 100),
            ],
        },
    )
    .await
    .unwrap();

    let playbooks = list_playbooks_db(&db).await.unwrap();

    assert_eq!(
        playbooks[0]
            .steps
            .iter()
            .map(|s| s.command.as_str())
            .collect::<Vec<_>>(),
        vec!["git pull", "make build", "make restart"]
    );
}

#[tokio::test]
async fn update_playbook_replaces_steps_rather_than_appending() {
    let db = test_pool().await;
    let created = create_playbook_db(
        &db,
        &CreatePlaybookPayload {
            title: "Tail logs".into(),
            description: None,
            steps: vec![step("tail -f /var/log/syslog", 0)],
        },
    )
    .await
    .unwrap();

    let updated = update_playbook_db(
        &db,
        &created.id,
        &UpdatePlaybookPayload {
            title: "Tail logs".into(),
            description: None,
            steps: vec![
                step("tail -f /var/log/nginx/access.log", 0),
                step("tail -f /var/log/nginx/error.log", 0),
            ],
        },
    )
    .await
    .unwrap();

    assert_eq!(
        updated
            .steps
            .iter()
            .map(|s| s.command.as_str())
            .collect::<Vec<_>>(),
        vec![
            "tail -f /var/log/nginx/access.log",
            "tail -f /var/log/nginx/error.log"
        ]
    );
}

#[tokio::test]
async fn delete_playbook_cascades_to_steps() {
    let db = test_pool().await;
    let created = create_playbook_db(
        &db,
        &CreatePlaybookPayload {
            title: "One-off".into(),
            description: None,
            steps: vec![step("uptime", 0)],
        },
    )
    .await
    .unwrap();

    delete_playbook_db(&db, &created.id).await.unwrap();

    let remaining_steps: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM playbook_steps WHERE playbook_id = ?")
            .bind(&created.id)
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(remaining_steps, 0);
}
