use super::*;
use std::fs;

fn write_known_hosts(content: &str) -> std::path::PathBuf {
    let path = std::env::temp_dir().join(format!("known_hosts_test_{}", uuid::Uuid::new_v4()));
    fs::write(&path, content).expect("write temp known_hosts");
    path
}

#[test]
fn hosts_in_cidr_excludes_network_and_broadcast_for_slash_24() {
    let hosts = hosts_in_cidr(
        Ipv4Addr::new(192, 168, 1, 10),
        Ipv4Addr::new(255, 255, 255, 0),
    );
    assert_eq!(hosts.len(), 254);
    assert!(!hosts.contains(&Ipv4Addr::new(192, 168, 1, 0)));
    assert!(!hosts.contains(&Ipv4Addr::new(192, 168, 1, 255)));
    assert!(hosts.contains(&Ipv4Addr::new(192, 168, 1, 1)));
    assert!(hosts.contains(&Ipv4Addr::new(192, 168, 1, 254)));
}

#[test]
fn hosts_in_cidr_returns_two_usable_hosts_for_slash_30() {
    let hosts = hosts_in_cidr(
        Ipv4Addr::new(10, 0, 0, 1),
        Ipv4Addr::new(255, 255, 255, 252),
    );
    assert_eq!(
        hosts,
        vec![Ipv4Addr::new(10, 0, 0, 1), Ipv4Addr::new(10, 0, 0, 2)]
    );
}

#[test]
fn hosts_in_cidr_returns_empty_for_slash_31() {
    let hosts = hosts_in_cidr(
        Ipv4Addr::new(10, 0, 0, 1),
        Ipv4Addr::new(255, 255, 255, 254),
    );
    assert!(hosts.is_empty());
}

#[test]
fn parse_known_hosts_skips_hashed_entries() {
    let path = write_known_hosts("|1|abc123==|def456== ssh-ed25519 AAAA...\n");
    let hosts = parse_known_hosts(&path).unwrap();
    fs::remove_file(&path).ok();
    assert!(hosts.is_empty());
}

#[test]
fn parse_known_hosts_skips_wildcards() {
    let path = write_known_hosts("*.example.com ssh-ed25519 AAAA...\n");
    let hosts = parse_known_hosts(&path).unwrap();
    fs::remove_file(&path).ok();
    assert!(hosts.is_empty());
}

#[test]
fn parse_known_hosts_parses_bracketed_host_and_port() {
    let path = write_known_hosts("[example.com]:2222 ssh-ed25519 AAAA...\n");
    let hosts = parse_known_hosts(&path).unwrap();
    fs::remove_file(&path).ok();

    assert_eq!(hosts.len(), 1);
    assert_eq!(hosts[0].ip, "example.com");
    assert_eq!(hosts[0].port, 2222);
    assert_eq!(hosts[0].source, "knownHosts");
}

#[test]
fn parse_known_hosts_defaults_to_port_22() {
    let path = write_known_hosts("10.0.0.5 ssh-ed25519 AAAA...\n");
    let hosts = parse_known_hosts(&path).unwrap();
    fs::remove_file(&path).ok();

    assert_eq!(hosts.len(), 1);
    assert_eq!(hosts[0].ip, "10.0.0.5");
    assert_eq!(hosts[0].port, 22);
}

#[test]
fn parse_known_hosts_handles_comma_separated_hosts() {
    let path = write_known_hosts("host-a,10.0.0.5 ssh-ed25519 AAAA...\n");
    let hosts = parse_known_hosts(&path).unwrap();
    fs::remove_file(&path).ok();

    let ips: HashSet<_> = hosts.iter().map(|h| h.ip.as_str()).collect();
    assert_eq!(ips, HashSet::from(["host-a", "10.0.0.5"]));
}

#[test]
fn parse_known_hosts_dedups_repeated_entries() {
    let path = write_known_hosts("10.0.0.5 ssh-ed25519 AAAA...\n10.0.0.5 ssh-rsa BBBB...\n");
    let hosts = parse_known_hosts(&path).unwrap();
    fs::remove_file(&path).ok();

    assert_eq!(hosts.len(), 1);
}

#[test]
fn parse_known_hosts_returns_empty_for_missing_file() {
    let path = std::env::temp_dir().join(format!("missing_{}", uuid::Uuid::new_v4()));
    let hosts = parse_known_hosts(&path).unwrap();
    assert!(hosts.is_empty());
}

#[test]
fn default_identity_file_path_returns_first_existing_key() {
    let dir = std::env::temp_dir().join(format!("ssh_dir_test_{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("id_rsa"), "fake").unwrap();
    fs::write(dir.join("id_ed25519"), "fake").unwrap();

    let result = default_identity_file_path(&dir);
    fs::remove_dir_all(&dir).ok();

    assert_eq!(
        result,
        Some(dir.join("id_ed25519").to_string_lossy().to_string())
    );
}

#[test]
fn default_identity_file_path_returns_none_when_no_keys_exist() {
    let dir = std::env::temp_dir().join(format!("ssh_dir_empty_{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).unwrap();

    let result = default_identity_file_path(&dir);
    fs::remove_dir_all(&dir).ok();

    assert!(result.is_none());
}

#[test]
fn identity_file_from_params_matches_host_pattern() {
    let config = SshConfig::default()
        .parse(
            &mut std::io::Cursor::new("Host web\n  IdentityFile ~/.ssh/web_key\n".as_bytes()),
            ParseRule::ALLOW_UNKNOWN_FIELDS,
        )
        .unwrap();
    let home = std::env::var("HOME").unwrap();

    let result = identity_file_from_params(&config.query("web"));

    assert_eq!(result, Some(format!("{home}/.ssh/web_key")));
}

#[test]
fn identity_file_from_params_returns_none_for_unmatched_host() {
    let config = SshConfig::default()
        .parse(
            &mut std::io::Cursor::new("Host web\n  IdentityFile ~/.ssh/web_key\n".as_bytes()),
            ParseRule::ALLOW_UNKNOWN_FIELDS,
        )
        .unwrap();

    let result = identity_file_from_params(&config.query("other"));

    assert!(result.is_none());
}

#[test]
fn host_params_user_matches_host_pattern() {
    let config = SshConfig::default()
        .parse(
            &mut std::io::Cursor::new("Host web\n  User deploy\n".as_bytes()),
            ParseRule::ALLOW_UNKNOWN_FIELDS,
        )
        .unwrap();

    assert_eq!(config.query("web").user, Some("deploy".to_string()));
    assert_eq!(config.query("other").user, None);
}
