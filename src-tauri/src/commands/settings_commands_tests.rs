use super::*;

async fn make_db() -> sqlx::SqlitePool {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::query("CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)")
        .execute(&pool)
        .await
        .unwrap();
    pool
}

// Regression test for every key the frontend actually writes — catches the
// terminal_ghost_suggestions bug, where a key the frontend used was missing
// from this list and silently broke persistence for every terminal setting.
#[test]
fn allows_every_key_the_frontend_writes() {
    for key in [
        "vault_timeout_minutes",
        "theme",
        "accent",
        "onboarding_complete",
        "terminal_font_size",
        "terminal_line_height",
        "terminal_scrollback",
        "terminal_copy_on_select",
        "terminal_ghost_suggestions",
        "terminal_font_family",
        "terminal_theme",
        "terminal_cursor_style",
        "default_terminal",
        "accent_custom_color",
        "ssh_keepalive_interval",
    ] {
        assert!(
            is_allowed_setting(key),
            "{key} should be an allowed setting"
        );
    }
}

#[test]
fn rejects_an_unknown_key() {
    assert!(!is_allowed_setting("not_a_real_setting"));
}

#[tokio::test]
async fn round_trips_an_allowed_setting() {
    let db = make_db().await;
    set_setting_value(&db, "terminal_ghost_suggestions", "true")
        .await
        .unwrap();

    let value = get_setting_value(&db, "terminal_ghost_suggestions")
        .await
        .unwrap();

    assert_eq!(value, Some("true".to_string()));
}

#[tokio::test]
async fn get_setting_value_returns_none_for_a_key_never_written() {
    let db = make_db().await;
    let value = get_setting_value(&db, "terminal_theme").await.unwrap();
    assert_eq!(value, None);
}

#[tokio::test]
async fn set_setting_value_overwrites_the_previous_value() {
    let db = make_db().await;
    set_setting_value(&db, "terminal_theme", "dracula")
        .await
        .unwrap();
    set_setting_value(&db, "terminal_theme", "nord")
        .await
        .unwrap();

    let value = get_setting_value(&db, "terminal_theme").await.unwrap();

    assert_eq!(value, Some("nord".to_string()));
}
