use super::*;

async fn make_pool() -> SqlitePool {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::migrate!("src/db/migrations")
        .run(&pool)
        .await
        .unwrap();
    pool
}

fn payload(name: &str, host: &str) -> CreateServerPayload {
    CreateServerPayload {
        display_name: name.into(),
        hostname: host.into(),
        port: None,
        username: Some("ubuntu".into()),
        auth_method: None,
        identity_file_path: None,
        vault_credential_id: None,
        group_id: None,
        is_jump_host: None,
        jump_host_id: None,
        initial_dir: None,
        env_vars: None,
        pre_connect_hook: None,
        post_disconnect_hook: None,
        terminal_theme: None,
        tag_ids: None,
    }
}

#[tokio::test]
async fn create_and_get_server() {
    let db = make_pool().await;
    let s = create_server_db(&db, &payload("Prod Web", "web.example.com"))
        .await
        .unwrap();

    assert_eq!(s.server.display_name, "Prod Web");
    assert_eq!(s.server.hostname, "web.example.com");
    assert_eq!(s.server.port, 22);
    assert_eq!(s.server.username, "ubuntu");
    assert!(s.tags.is_empty());

    let fetched = get_server_db(&db, &s.server.id).await.unwrap();
    assert_eq!(fetched.server.id, s.server.id);
}

#[tokio::test]
async fn list_servers_empty() {
    let db = make_pool().await;
    assert!(list_servers_db(&db).await.unwrap().is_empty());
}

#[tokio::test]
async fn list_servers_batch_loads_tags() {
    let db = make_pool().await;
    let tag = create_tag_db(&db, "production").await.unwrap();

    let p = CreateServerPayload {
        tag_ids: Some(vec![tag.id.clone()]),
        ..payload("DB", "db.example.com")
    };
    create_server_db(&db, &p).await.unwrap();
    create_server_db(&db, &payload("Cache", "cache.example.com"))
        .await
        .unwrap();

    let servers = list_servers_db(&db).await.unwrap();
    assert_eq!(servers.len(), 2);
    let db_server = servers
        .iter()
        .find(|s| s.server.hostname == "db.example.com")
        .unwrap();
    assert_eq!(db_server.tags.len(), 1);
    assert_eq!(db_server.tags[0].name, "production");
}

#[tokio::test]
async fn update_server_changes_fields() {
    let db = make_pool().await;
    let s = create_server_db(&db, &payload("Old", "old.example.com"))
        .await
        .unwrap();

    let updated = update_server_db(
        &db,
        &s.server.id,
        &UpdateServerPayload {
            display_name: Some("New".into()),
            port: Some(2222),
            ..Default::default()
        },
    )
    .await
    .unwrap();

    assert_eq!(updated.server.display_name, "New");
    assert_eq!(updated.server.port, 2222);
    assert_eq!(updated.server.hostname, "old.example.com");
}

#[tokio::test]
async fn confirm_server_hooks_db_persists_the_snapshot() {
    let db = make_pool().await;
    let s = create_server_db(&db, &payload("X", "x.example.com"))
        .await
        .unwrap();

    confirm_server_hooks_db(&db, &s.server.id, Some("echo hi"), Some("echo bye"))
        .await
        .unwrap();

    let fetched = get_server_db(&db, &s.server.id).await.unwrap();
    assert_eq!(
        fetched.server.pre_connect_hook_confirmed.as_deref(),
        Some("echo hi")
    );
    assert_eq!(
        fetched.server.post_disconnect_hook_confirmed.as_deref(),
        Some("echo bye")
    );
}

#[tokio::test]
async fn update_server_db_never_touches_hook_confirmation_columns() {
    // UpdateServerPayload has no field for these columns at all, so this
    // mainly guards against a future UPDATE statement accidentally
    // including them — which would let an IPC caller set a hook and its own
    // "confirmed" snapshot in the same call, skipping the confirmation
    // prompt entirely (the vault_credential_id IDOR's exact shape).
    let db = make_pool().await;
    let s = create_server_db(&db, &payload("X", "x.example.com"))
        .await
        .unwrap();
    confirm_server_hooks_db(&db, &s.server.id, Some("echo confirmed"), None)
        .await
        .unwrap();

    let updated = update_server_db(
        &db,
        &s.server.id,
        &UpdateServerPayload {
            pre_connect_hook: Some("echo something-else".into()),
            ..Default::default()
        },
    )
    .await
    .unwrap();

    assert_eq!(
        updated.server.pre_connect_hook_confirmed.as_deref(),
        Some("echo confirmed")
    );
}

#[tokio::test]
async fn update_server_replaces_tags() {
    let db = make_pool().await;
    let t1 = create_tag_db(&db, "staging").await.unwrap();
    let t2 = create_tag_db(&db, "production").await.unwrap();

    let s = create_server_db(
        &db,
        &CreateServerPayload {
            tag_ids: Some(vec![t1.id.clone()]),
            ..payload("Web", "web.example.com")
        },
    )
    .await
    .unwrap();

    let updated = update_server_db(
        &db,
        &s.server.id,
        &UpdateServerPayload {
            tag_ids: Some(vec![t2.id.clone()]),
            ..Default::default()
        },
    )
    .await
    .unwrap();

    assert_eq!(updated.tags.len(), 1);
    assert_eq!(updated.tags[0].id, t2.id);
}

#[tokio::test]
async fn update_server_rejects_credential_owned_by_another_server() {
    let db = make_pool().await;
    let victim = create_server_db(
        &db,
        &CreateServerPayload {
            vault_credential_id: Some("victim-cred".into()),
            ..payload("Victim", "victim.example.com")
        },
    )
    .await
    .unwrap();
    let attacker = create_server_db(&db, &payload("Attacker", "attacker.example.com"))
        .await
        .unwrap();

    let result = update_server_db(
        &db,
        &attacker.server.id,
        &UpdateServerPayload {
            vault_credential_id: Some(victim.server.vault_credential_id.clone().unwrap()),
            ..Default::default()
        },
    )
    .await;

    assert!(matches!(result, Err(AppError::Validation(_))));
}

#[tokio::test]
async fn create_server_rejects_credential_owned_by_another_server() {
    let db = make_pool().await;
    let victim = create_server_db(
        &db,
        &CreateServerPayload {
            vault_credential_id: Some("victim-cred".into()),
            ..payload("Victim", "victim.example.com")
        },
    )
    .await
    .unwrap();

    let result = create_server_db(
        &db,
        &CreateServerPayload {
            vault_credential_id: victim.server.vault_credential_id.clone(),
            ..payload("Attacker", "attacker.example.com")
        },
    )
    .await;

    assert!(matches!(result, Err(AppError::Validation(_))));
}

#[tokio::test]
async fn vault_credential_unique_index_rejects_duplicate_at_db_layer() {
    // create_server_db's ownership pre-check has a TOCTOU gap between two
    // concurrent writers — it can't be the thing that actually prevents two
    // servers from ending up with the same vault_credential_id. The partial
    // unique index from migration 0019 is the real backstop, so exercise it
    // directly via raw inserts that bypass create_server_db's pre-check.
    let db = make_pool().await;
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO servers (id, display_name, hostname, vault_credential_id, created_at, updated_at)
         VALUES (?, 'A', 'a.example.com', 'raced-cred', ?, ?)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&now)
    .bind(&now)
    .execute(&db)
    .await
    .unwrap();

    let result = sqlx::query(
        "INSERT INTO servers (id, display_name, hostname, vault_credential_id, created_at, updated_at)
         VALUES (?, 'B', 'b.example.com', 'raced-cred', ?, ?)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&now)
    .bind(&now)
    .execute(&db)
    .await;

    assert!(result.is_err());
}

#[tokio::test]
async fn update_server_accepts_unowned_credential() {
    let db = make_pool().await;
    let s = create_server_db(&db, &payload("Fresh", "fresh.example.com"))
        .await
        .unwrap();

    let updated = update_server_db(
        &db,
        &s.server.id,
        &UpdateServerPayload {
            vault_credential_id: Some("freshly-minted-cred".into()),
            ..Default::default()
        },
    )
    .await
    .unwrap();

    assert_eq!(
        updated.server.vault_credential_id,
        Some("freshly-minted-cred".into())
    );
}

#[tokio::test]
async fn delete_server_removes_it() {
    let db = make_pool().await;
    let s = create_server_db(&db, &payload("Temp", "temp.example.com"))
        .await
        .unwrap();
    delete_server_db(&db, &s.server.id).await.unwrap();
    assert!(matches!(
        get_server_db(&db, &s.server.id).await,
        Err(AppError::NotFound(_))
    ));
}

#[tokio::test]
async fn delete_nonexistent_server_is_not_found() {
    let db = make_pool().await;
    assert!(matches!(
        delete_server_db(&db, "no-such-id").await,
        Err(AppError::NotFound(_))
    ));
}

#[tokio::test]
async fn validation_rejects_empty_display_name() {
    let db = make_pool().await;
    assert!(matches!(
        create_server_db(&db, &payload("", "host.example.com")).await,
        Err(AppError::Validation(_))
    ));
}

#[tokio::test]
async fn validation_rejects_invalid_port() {
    let db = make_pool().await;
    let p = CreateServerPayload {
        port: Some(99999),
        ..payload("X", "x.example.com")
    };
    assert!(matches!(
        create_server_db(&db, &p).await,
        Err(AppError::Validation(_))
    ));
}

#[tokio::test]
async fn create_server_rejects_identity_file_path_with_newline_injection() {
    let db = make_pool().await;
    let p = CreateServerPayload {
        identity_file_path: Some("/home/user/.ssh/id_rsa\nProxyCommand evil".into()),
        ..payload("X", "x.example.com")
    };
    assert!(matches!(
        create_server_db(&db, &p).await,
        Err(AppError::Validation(_))
    ));
}

#[tokio::test]
async fn update_server_rejects_identity_file_path_with_newline_injection() {
    let db = make_pool().await;
    let s = create_server_db(&db, &payload("X", "x.example.com"))
        .await
        .unwrap();

    let result = update_server_db(
        &db,
        &s.server.id,
        &UpdateServerPayload {
            identity_file_path: Some("/home/user/.ssh/id_rsa\nProxyCommand evil".into()),
            ..Default::default()
        },
    )
    .await;

    assert!(matches!(result, Err(AppError::Validation(_))));
}

#[tokio::test]
async fn create_server_accepts_identity_file_path_with_spaces() {
    let db = make_pool().await;
    let p = CreateServerPayload {
        identity_file_path: Some("/Users/me/My Drive/keys/id_ed25519".into()),
        ..payload("X", "x.example.com")
    };
    let s = create_server_db(&db, &p).await.unwrap();
    assert_eq!(
        s.server.identity_file_path,
        Some("/Users/me/My Drive/keys/id_ed25519".into())
    );
}

#[tokio::test]
async fn create_and_list_groups() {
    let db = make_pool().await;
    let g = create_group_db(&db, "Production", Some("#e53e3e"))
        .await
        .unwrap();
    assert_eq!(g.name, "Production");
    assert_eq!(g.color.as_deref(), Some("#e53e3e"));

    let groups = list_groups_db(&db).await.unwrap();
    assert_eq!(groups.len(), 1);
    assert_eq!(groups[0].id, g.id);
}

#[tokio::test]
async fn create_group_rejects_duplicate_name() {
    let db = make_pool().await;
    create_group_db(&db, "Production", None).await.unwrap();

    let err = create_group_db(&db, "Production", None).await.unwrap_err();
    assert!(matches!(err, AppError::Validation(ref m) if m.contains("already exists")));
}

#[tokio::test]
async fn update_group_rejects_duplicate_name() {
    let db = make_pool().await;
    create_group_db(&db, "Production", None).await.unwrap();
    let staging = create_group_db(&db, "Staging", None).await.unwrap();

    let err = update_group_db(&db, &staging.id, "Production", None)
        .await
        .unwrap_err();
    assert!(matches!(err, AppError::Validation(ref m) if m.contains("already exists")));
}

#[tokio::test]
async fn update_tag_rejects_duplicate_name() {
    let db = make_pool().await;
    create_tag_db(&db, "prod").await.unwrap();
    let staging = create_tag_db(&db, "staging").await.unwrap();

    let err = update_tag_db(&db, &staging.id, "prod").await.unwrap_err();
    assert!(matches!(err, AppError::Validation(ref m) if m.contains("already exists")));
}

#[tokio::test]
async fn create_tag_is_idempotent() {
    let db = make_pool().await;
    let t1 = create_tag_db(&db, "prod").await.unwrap();
    let t2 = create_tag_db(&db, "prod").await.unwrap();
    assert_eq!(t1.id, t2.id);
    assert_eq!(list_tags_db(&db).await.unwrap().len(), 1);
}

// ── port forward tests ────────────────────────────────────────────────────

fn fwd_payload(server_id: &str) -> CreatePortForwardPayload {
    use crate::models::port_forward::PortForwardFields;
    CreatePortForwardPayload {
        server_id: server_id.into(),
        fields: PortForwardFields {
            label: "DB tunnel".into(),
            forward_type: "local".into(),
            local_port: 5432,
            remote_host: "db.internal".into(),
            remote_port: 5432,
            auto_start: false,
        },
    }
}

async fn make_server(db: &SqlitePool) -> String {
    create_server_db(db, &payload("Test", "host.example.com"))
        .await
        .unwrap()
        .server
        .id
}

#[tokio::test]
async fn create_and_list_port_forward() {
    let db = make_pool().await;
    let sid = make_server(&db).await;
    let fwd = create_port_forward_db(&db, &fwd_payload(&sid))
        .await
        .unwrap();

    assert_eq!(fwd.server_id, sid);
    assert_eq!(fwd.forward_type, "local");
    assert_eq!(fwd.local_port, 5432);
    assert_eq!(fwd.remote_host, "db.internal");
    assert!(!fwd.auto_start);

    let list = list_port_forwards_db(&db, Some(&sid)).await.unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].id, fwd.id);
}

#[tokio::test]
async fn list_port_forwards_without_server_filter_returns_all() {
    let db = make_pool().await;
    let sid1 = make_server(&db).await;
    let sid2 = create_server_db(&db, &payload("Other", "other.example.com"))
        .await
        .unwrap()
        .server
        .id;
    create_port_forward_db(&db, &fwd_payload(&sid1))
        .await
        .unwrap();
    create_port_forward_db(&db, &fwd_payload(&sid2))
        .await
        .unwrap();

    let all = list_port_forwards_db(&db, None).await.unwrap();
    assert_eq!(all.len(), 2);
}

#[tokio::test]
async fn update_port_forward_persists_changes() {
    let db = make_pool().await;
    let sid = make_server(&db).await;
    let fwd = create_port_forward_db(&db, &fwd_payload(&sid))
        .await
        .unwrap();

    let updated = update_port_forward_db(
        &db,
        &fwd.id,
        &UpdatePortForwardPayload {
            label: "Updated".into(),
            forward_type: "local".into(),
            local_port: 15432,
            remote_host: "db.internal".into(),
            remote_port: 5432,
            auto_start: true,
        },
    )
    .await
    .unwrap();

    assert_eq!(updated.label, "Updated");
    assert_eq!(updated.local_port, 15432);
    assert!(updated.auto_start);
}

#[tokio::test]
async fn delete_port_forward_removes_row() {
    let db = make_pool().await;
    let sid = make_server(&db).await;
    let fwd = create_port_forward_db(&db, &fwd_payload(&sid))
        .await
        .unwrap();
    delete_port_forward_db(&db, &fwd.id).await.unwrap();

    let list = list_port_forwards_db(&db, Some(&sid)).await.unwrap();
    assert!(list.is_empty());
}

#[tokio::test]
async fn delete_server_cascades_to_port_forwards() {
    let db = make_pool().await;
    let sid = make_server(&db).await;
    create_port_forward_db(&db, &fwd_payload(&sid))
        .await
        .unwrap();

    delete_server_db(&db, &sid).await.unwrap();

    let list = list_port_forwards_db(&db, Some(&sid)).await.unwrap();
    assert!(list.is_empty());
}

#[tokio::test]
async fn dynamic_forward_ignores_remote_host_and_port() {
    let db = make_pool().await;
    let sid = make_server(&db).await;
    let fwd = create_port_forward_db(
        &db,
        &CreatePortForwardPayload {
            server_id: sid.clone(),
            fields: crate::models::port_forward::PortForwardFields {
                label: "SOCKS".into(),
                forward_type: "dynamic".into(),
                local_port: 1080,
                remote_host: String::new(),
                remote_port: 0,
                auto_start: false,
            },
        },
    )
    .await
    .unwrap();

    assert_eq!(fwd.forward_type, "dynamic");
    assert_eq!(fwd.local_port, 1080);
}

#[tokio::test]
async fn validation_rejects_invalid_forward_type() {
    let db = make_pool().await;
    let sid = make_server(&db).await;
    let mut p = fwd_payload(&sid);
    p.fields.forward_type = "banana".into();
    assert!(matches!(
        create_port_forward_db(&db, &p).await,
        Err(AppError::Validation(_))
    ));
}

#[tokio::test]
async fn validation_rejects_out_of_range_local_port() {
    let db = make_pool().await;
    let sid = make_server(&db).await;
    let mut p = fwd_payload(&sid);
    p.fields.local_port = 99999;
    assert!(matches!(
        create_port_forward_db(&db, &p).await,
        Err(AppError::Validation(_))
    ));
}

#[tokio::test]
async fn validation_rejects_missing_remote_host_for_local_forward() {
    let db = make_pool().await;
    let sid = make_server(&db).await;
    let mut p = fwd_payload(&sid);
    p.fields.remote_host = String::new();
    assert!(matches!(
        create_port_forward_db(&db, &p).await,
        Err(AppError::Validation(_))
    ));
}

#[tokio::test]
async fn update_nonexistent_forward_is_not_found() {
    let db = make_pool().await;
    assert!(matches!(
        update_port_forward_db(
            &db,
            "no-such-id",
            &UpdatePortForwardPayload {
                label: String::new(),
                forward_type: "local".into(),
                local_port: 22,
                remote_host: "h.example.com".into(),
                remote_port: 22,
                auto_start: false,
            }
        )
        .await,
        Err(AppError::NotFound(_))
    ));
}

#[tokio::test]
async fn delete_nonexistent_forward_is_not_found() {
    let db = make_pool().await;
    assert!(matches!(
        delete_port_forward_db(&db, "no-such-id").await,
        Err(AppError::NotFound(_))
    ));
}

#[tokio::test]
async fn new_servers_get_ascending_sort_positions() {
    let db = make_pool().await;
    let a = create_server_db(&db, &payload("Alpha", "alpha.example.com"))
        .await
        .unwrap();
    let b = create_server_db(&db, &payload("Beta", "beta.example.com"))
        .await
        .unwrap();
    let c = create_server_db(&db, &payload("Gamma", "gamma.example.com"))
        .await
        .unwrap();

    assert!(a.server.sort_position < b.server.sort_position);
    assert!(b.server.sort_position < c.server.sort_position);
}

#[tokio::test]
async fn reorder_servers_changes_listed_order() {
    let db = make_pool().await;
    let a = create_server_db(&db, &payload("Alpha", "alpha.example.com"))
        .await
        .unwrap();
    let b = create_server_db(&db, &payload("Beta", "beta.example.com"))
        .await
        .unwrap();
    let c = create_server_db(&db, &payload("Gamma", "gamma.example.com"))
        .await
        .unwrap();

    // Reverse the order: c, a, b
    reorder_servers_db(&db, &[c.server.id.clone(), a.server.id.clone(), b.server.id.clone()])
        .await
        .unwrap();

    let listed: Vec<String> = list_servers_db(&db)
        .await
        .unwrap()
        .into_iter()
        .map(|s| s.server.display_name)
        .collect();

    assert_eq!(listed, vec!["Gamma", "Alpha", "Beta"]);
}

#[tokio::test]
async fn reorder_servers_partial_list_is_idempotent() {
    let db = make_pool().await;
    let a = create_server_db(&db, &payload("Alpha", "alpha.example.com"))
        .await
        .unwrap();
    let b = create_server_db(&db, &payload("Beta", "beta.example.com"))
        .await
        .unwrap();

    // Reordering with the same IDs does not change the result.
    reorder_servers_db(&db, &[a.server.id.clone(), b.server.id.clone()])
        .await
        .unwrap();
    reorder_servers_db(&db, &[a.server.id.clone(), b.server.id.clone()])
        .await
        .unwrap();

    let listed: Vec<String> = list_servers_db(&db)
        .await
        .unwrap()
        .into_iter()
        .map(|s| s.server.display_name)
        .collect();

    assert_eq!(listed, vec!["Alpha", "Beta"]);
}
