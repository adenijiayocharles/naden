use super::*;
use std::fs;

fn write_config(content: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!("ssh_config_test_{}.conf", uuid::Uuid::new_v4()));
    fs::write(&path, content).expect("write temp config");
    path
}

#[test]
fn parses_basic_host() {
    let path = write_config("Host web\n  HostName 10.0.0.1\n  User ubuntu\n  Port 2222\n");
    let previews = parse_ssh_config_inner(&path, None).unwrap();
    fs::remove_file(&path).ok();

    assert_eq!(previews.len(), 1);
    assert_eq!(previews[0].pattern, "web");
    assert_eq!(previews[0].hostname.as_deref(), Some("10.0.0.1"));
    assert_eq!(previews[0].username.as_deref(), Some("ubuntu"));
    assert_eq!(previews[0].port, Some(2222));
}

#[test]
fn parses_multiple_hosts() {
    let path = write_config(
        "Host alpha\n  HostName 1.2.3.4\n\nHost beta\n  HostName 5.6.7.8\n  Port 2222\n",
    );
    let previews = parse_ssh_config_inner(&path, None).unwrap();
    fs::remove_file(&path).ok();

    assert_eq!(previews.len(), 2);
    assert_eq!(previews[0].pattern, "alpha");
    assert_eq!(previews[1].pattern, "beta");
    assert_eq!(previews[1].port, Some(2222));
}

#[test]
fn skips_wildcard_catch_all() {
    let path = write_config("Host *\n  ServerAliveInterval 60\n");
    let previews = parse_ssh_config_inner(&path, None).unwrap();
    fs::remove_file(&path).ok();
    assert!(previews.is_empty());
}

#[test]
fn skips_negated_patterns() {
    let path = write_config("Host prod !secret\n  HostName 10.0.0.1\n");
    let previews = parse_ssh_config_inner(&path, None).unwrap();
    fs::remove_file(&path).ok();

    // Only "prod" should appear; "!secret" is negated
    assert!(previews.iter().all(|p| p.pattern == "prod"));
}

#[test]
fn captures_identity_file() {
    let path = write_config(
        "Host jump\n  HostName bastion.example.com\n  IdentityFile ~/.ssh/id_ed25519\n",
    );
    let previews = parse_ssh_config_inner(&path, None).unwrap();
    fs::remove_file(&path).ok();

    assert_eq!(previews.len(), 1);
    assert!(previews[0].identity_file_path.is_some());
}

#[test]
fn returns_error_for_missing_file() {
    let result = parse_ssh_config_inner(&PathBuf::from("/nonexistent/path/to/config"), None);
    assert!(matches!(result, Err(crate::error::AppError::Io(_))));
}

#[test]
fn empty_config_returns_no_previews() {
    let path = write_config("");
    let previews = parse_ssh_config_inner(&path, None).unwrap();
    fs::remove_file(&path).ok();
    assert!(previews.is_empty());
}

#[test]
fn host_without_hostname_uses_pattern() {
    let path = write_config("Host myalias\n  Port 22\n");
    let previews = parse_ssh_config_inner(&path, None).unwrap();
    fs::remove_file(&path).ok();

    assert_eq!(previews.len(), 1);
    assert_eq!(previews[0].pattern, "myalias");
    // No HostName directive — hostname field is None
    assert!(previews[0].hostname.is_none());
}

#[test]
fn captures_proxy_jump() {
    let config = "\
Host bastion\n  HostName localhost\n  Port 2222\n  User admin\n\
Host private\n  HostName 10.10.0.20\n  Port 2222\n  User ubuntu\n  ProxyJump bastion\n";
    let path = write_config(config);
    let previews = parse_ssh_config_inner(&path, None).unwrap();
    fs::remove_file(&path).ok();

    assert_eq!(previews.len(), 2);
    let bastion = previews.iter().find(|p| p.pattern == "bastion").unwrap();
    let private = previews.iter().find(|p| p.pattern == "private").unwrap();

    assert!(bastion.proxy_jump.is_none());
    assert_eq!(private.proxy_jump.as_deref(), Some("bastion"));
}

#[test]
fn no_proxy_jump_is_none() {
    let path = write_config("Host direct\n  HostName 1.2.3.4\n");
    let previews = parse_ssh_config_inner(&path, None).unwrap();
    fs::remove_file(&path).ok();

    assert!(previews[0].proxy_jump.is_none());
}
