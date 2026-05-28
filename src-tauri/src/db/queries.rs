use crate::error::AppError;
use crate::models::server::{
    CreateServerPayload, Group, Server, ServerWithTags, Tag, UpdateServerPayload,
};
use chrono::Utc;
use sqlx::SqlitePool;
use std::collections::HashMap;
use uuid::Uuid;

// ── helpers ──────────────────────────────────────────────────────────────────

/// Reject hostnames that contain shell metacharacters. Allows RFC 1123 names,
/// IPv4, and bracketed IPv6 (e.g. [::1]). Blocks backticks, $, ;, &, |, etc.
fn validate_hostname(hostname: &str) -> Result<(), AppError> {
    if hostname.is_empty() {
        return Err(AppError::Validation("hostname is required".into()));
    }
    if hostname.len() > 253 {
        return Err(AppError::Validation(
            "hostname must be 253 characters or fewer".into(),
        ));
    }
    if !hostname
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || ".-_:[]%".contains(c))
    {
        return Err(AppError::Validation(
            "hostname contains invalid characters (allowed: letters, digits, . - _ : [ ] %)".into(),
        ));
    }
    Ok(())
}

/// Reject usernames that contain shell metacharacters. Empty is allowed (system default).
fn validate_username(username: &str) -> Result<(), AppError> {
    if username.is_empty() {
        return Ok(());
    }
    if username.len() > 64 {
        return Err(AppError::Validation(
            "username must be 64 characters or fewer".into(),
        ));
    }
    if !username
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || "-_.@".contains(c))
    {
        return Err(AppError::Validation(
            "username contains invalid characters (allowed: letters, digits, - _ . @)".into(),
        ));
    }
    Ok(())
}

async fn tags_for_server(db: &SqlitePool, server_id: &str) -> Result<Vec<Tag>, AppError> {
    Ok(sqlx::query_as(
        "SELECT t.id, t.name FROM tags t
         JOIN server_tags st ON st.tag_id = t.id
         WHERE st.server_id = ?
         ORDER BY t.name",
    )
    .bind(server_id)
    .fetch_all(db)
    .await?)
}

// ── server queries ────────────────────────────────────────────────────────────

pub async fn list_servers_db(db: &SqlitePool) -> Result<Vec<ServerWithTags>, AppError> {
    let servers: Vec<Server> = sqlx::query_as("SELECT * FROM servers ORDER BY display_name")
        .fetch_all(db)
        .await?;

    if servers.is_empty() {
        return Ok(vec![]);
    }

    // Batch-load all tags in one query to avoid N+1
    let rows: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT st.server_id, t.id, t.name
         FROM server_tags st
         JOIN tags t ON t.id = st.tag_id
         ORDER BY st.server_id, t.name",
    )
    .fetch_all(db)
    .await?;

    let mut tags_map: HashMap<String, Vec<Tag>> = HashMap::new();
    for (server_id, tag_id, tag_name) in rows {
        tags_map.entry(server_id).or_default().push(Tag {
            id: tag_id,
            name: tag_name,
        });
    }

    Ok(servers
        .into_iter()
        .map(|server| {
            let tags = tags_map.remove(&server.id).unwrap_or_default();
            ServerWithTags { server, tags }
        })
        .collect())
}

pub async fn get_server_db(db: &SqlitePool, id: &str) -> Result<ServerWithTags, AppError> {
    let server: Option<Server> = sqlx::query_as("SELECT * FROM servers WHERE id = ?")
        .bind(id)
        .fetch_optional(db)
        .await?;

    let server = server.ok_or_else(|| AppError::NotFound(format!("server '{id}' not found")))?;
    let tags = tags_for_server(db, id).await?;
    Ok(ServerWithTags { server, tags })
}

pub async fn create_server_db(
    db: &SqlitePool,
    payload: &CreateServerPayload,
) -> Result<ServerWithTags, AppError> {
    if payload.display_name.trim().is_empty() {
        return Err(AppError::Validation("display_name is required".into()));
    }
    validate_hostname(&payload.hostname)?;
    if let Some(ref u) = payload.username {
        validate_username(u)?;
    }
    let port = payload.port.unwrap_or(22);
    if !(1..=65535).contains(&port) {
        return Err(AppError::Validation(
            "port must be between 1 and 65535".into(),
        ));
    }

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO servers
         (id, display_name, hostname, port, username, auth_method,
          identity_file_path, vault_credential_id, group_id,
          is_jump_host, jump_host_id, is_favourite, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&payload.display_name)
    .bind(&payload.hostname)
    .bind(port)
    .bind(payload.username.as_deref().unwrap_or(""))
    .bind(payload.auth_method.as_deref().unwrap_or("key"))
    .bind(&payload.identity_file_path)
    .bind(&payload.vault_credential_id)
    .bind(&payload.group_id)
    .bind(payload.is_jump_host.unwrap_or(false))
    .bind(&payload.jump_host_id)
    .bind(false) // is_favourite defaults to false on creation
    .bind(&now)
    .bind(&now)
    .execute(db)
    .await?;

    if let Some(tag_ids) = &payload.tag_ids {
        for tag_id in tag_ids {
            sqlx::query("INSERT OR IGNORE INTO server_tags (server_id, tag_id) VALUES (?, ?)")
                .bind(&id)
                .bind(tag_id)
                .execute(db)
                .await?;
        }
    }

    get_server_db(db, &id).await
}

pub async fn update_server_db(
    db: &SqlitePool,
    id: &str,
    payload: &UpdateServerPayload,
) -> Result<ServerWithTags, AppError> {
    // Validate before acquiring the transaction so we don't hold a write lock
    // during pure-CPU work.
    if let Some(ref h) = payload.hostname {
        validate_hostname(h)?;
    }
    if let Some(ref u) = payload.username {
        validate_username(u)?;
    }
    if let Some(port) = payload.port {
        if !(1..=65535).contains(&port) {
            return Err(AppError::Validation(
                "port must be between 1 and 65535".into(),
            ));
        }
    }

    // Wrap the read-then-write in a transaction so concurrent updates cannot
    // interleave and silently overwrite each other's changes.
    let mut tx = db.begin().await?;

    let existing: Option<crate::models::server::Server> =
        sqlx::query_as("SELECT * FROM servers WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let existing =
        existing.ok_or_else(|| AppError::NotFound(format!("server '{id}' not found")))?;
    let s = &existing;
    let now = Utc::now().to_rfc3339();

    let port = payload.port.unwrap_or(s.port);

    // vault_credential_id: if payload provides a new one use it; if not keep existing
    let vault_credential_id = payload
        .vault_credential_id
        .as_deref()
        .or(s.vault_credential_id.as_deref());

    // Normalise empty strings to NULL for nullable optional fields so callers can
    // clear group_id / identity_file_path by sending Some("") without breaking
    // IS NULL queries (e.g. ungrouped server lookup).
    let group_id = payload.group_id.as_deref().filter(|v| !v.is_empty());
    let identity_file_path = payload
        .identity_file_path
        .as_deref()
        .filter(|v| !v.is_empty());

    sqlx::query(
        "UPDATE servers SET
         display_name = ?, hostname = ?, port = ?, username = ?, auth_method = ?,
         identity_file_path = ?, vault_credential_id = ?, group_id = ?,
         is_jump_host = ?, jump_host_id = ?, is_favourite = ?, updated_at = ?
         WHERE id = ?",
    )
    .bind(payload.display_name.as_deref().unwrap_or(&s.display_name))
    .bind(payload.hostname.as_deref().unwrap_or(&s.hostname))
    .bind(port)
    .bind(payload.username.as_deref().unwrap_or(&s.username))
    .bind(payload.auth_method.as_deref().unwrap_or(&s.auth_method))
    .bind(identity_file_path)
    .bind(vault_credential_id)
    .bind(group_id)
    .bind(payload.is_jump_host.unwrap_or(s.is_jump_host))
    .bind(payload.jump_host_id.as_deref())
    .bind(payload.is_favourite.unwrap_or(s.is_favourite))
    .bind(&now)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    if let Some(tag_ids) = &payload.tag_ids {
        sqlx::query("DELETE FROM server_tags WHERE server_id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        for tag_id in tag_ids {
            sqlx::query("INSERT INTO server_tags (server_id, tag_id) VALUES (?, ?)")
                .bind(id)
                .bind(tag_id)
                .execute(&mut *tx)
                .await?;
        }
    }

    tx.commit().await?;

    get_server_db(db, id).await
}

pub async fn move_server_group_db(
    db: &SqlitePool,
    server_id: &str,
    group_id: Option<&str>,
) -> Result<ServerWithTags, AppError> {
    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE servers SET group_id = ?, updated_at = ? WHERE id = ?")
        .bind(group_id)
        .bind(&now)
        .bind(server_id)
        .execute(db)
        .await?;
    get_server_db(db, server_id).await
}

pub async fn toggle_favourite_db(
    db: &SqlitePool,
    server_id: &str,
) -> Result<ServerWithTags, AppError> {
    let current: Option<bool> =
        sqlx::query_scalar("SELECT is_favourite FROM servers WHERE id = ?")
            .bind(server_id)
            .fetch_optional(db)
            .await?;
    let current = current
        .ok_or_else(|| AppError::NotFound(format!("server '{server_id}' not found")))?;
    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE servers SET is_favourite = ?, updated_at = ? WHERE id = ?")
        .bind(!current)
        .bind(&now)
        .bind(server_id)
        .execute(db)
        .await?;
    get_server_db(db, server_id).await
}

pub async fn delete_server_db(db: &SqlitePool, id: &str) -> Result<(), AppError> {
    let rows = sqlx::query("DELETE FROM servers WHERE id = ?")
        .bind(id)
        .execute(db)
        .await?
        .rows_affected();

    if rows == 0 {
        return Err(AppError::NotFound(format!("server '{id}' not found")));
    }
    Ok(())
}

// ── group queries ─────────────────────────────────────────────────────────────

pub async fn list_groups_db(db: &SqlitePool) -> Result<Vec<Group>, AppError> {
    Ok(sqlx::query_as("SELECT * FROM groups ORDER BY name")
        .fetch_all(db)
        .await?)
}

pub async fn create_group_db(
    db: &SqlitePool,
    name: &str,
    color: Option<&str>,
) -> Result<Group, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("group name is required".into()));
    }
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO groups (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(name)
    .bind(color)
    .bind(&now)
    .bind(&now)
    .execute(db)
    .await?;

    Ok(sqlx::query_as("SELECT * FROM groups WHERE id = ?")
        .bind(&id)
        .fetch_one(db)
        .await?)
}

pub async fn update_group_db(
    db: &SqlitePool,
    group_id: &str,
    name: &str,
    color: Option<&str>,
) -> Result<Group, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("group name is required".into()));
    }
    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE groups SET name = ?, color = ?, updated_at = ? WHERE id = ?")
        .bind(name)
        .bind(color)
        .bind(&now)
        .bind(group_id)
        .execute(db)
        .await?;
    Ok(sqlx::query_as("SELECT * FROM groups WHERE id = ?")
        .bind(group_id)
        .fetch_one(db)
        .await?)
}

pub async fn delete_group_db(db: &SqlitePool, group_id: &str) -> Result<(), AppError> {
    // Ungrouped servers in this group first
    sqlx::query("UPDATE servers SET group_id = NULL WHERE group_id = ?")
        .bind(group_id)
        .execute(db)
        .await?;
    sqlx::query("DELETE FROM groups WHERE id = ?")
        .bind(group_id)
        .execute(db)
        .await?;
    Ok(())
}

// ── tag queries ───────────────────────────────────────────────────────────────

pub async fn list_tags_db(db: &SqlitePool) -> Result<Vec<Tag>, AppError> {
    Ok(sqlx::query_as("SELECT * FROM tags ORDER BY name")
        .fetch_all(db)
        .await?)
}

pub async fn update_tag_db(db: &SqlitePool, id: &str, name: &str) -> Result<Tag, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("tag name is required".into()));
    }
    let rows = sqlx::query("UPDATE tags SET name = ? WHERE id = ?")
        .bind(name.trim())
        .bind(id)
        .execute(db)
        .await?
        .rows_affected();
    if rows == 0 {
        return Err(AppError::NotFound(format!("tag '{id}' not found")));
    }
    Ok(sqlx::query_as("SELECT * FROM tags WHERE id = ?")
        .bind(id)
        .fetch_one(db)
        .await?)
}

pub async fn delete_tag_db(db: &SqlitePool, id: &str) -> Result<(), AppError> {
    sqlx::query("DELETE FROM tags WHERE id = ?")
        .bind(id)
        .execute(db)
        .await?;
    Ok(())
}

/// Inserts a new tag, or returns the existing one if the name already exists.
pub async fn create_tag_db(db: &SqlitePool, name: &str) -> Result<Tag, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("tag name is required".into()));
    }
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)")
        .bind(&id)
        .bind(name)
        .execute(db)
        .await?;

    Ok(sqlx::query_as("SELECT * FROM tags WHERE name = ?")
        .bind(name)
        .fetch_one(db)
        .await?)
}

// ── tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
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
    async fn create_tag_is_idempotent() {
        let db = make_pool().await;
        let t1 = create_tag_db(&db, "prod").await.unwrap();
        let t2 = create_tag_db(&db, "prod").await.unwrap();
        assert_eq!(t1.id, t2.id);
        assert_eq!(list_tags_db(&db).await.unwrap().len(), 1);
    }
}
