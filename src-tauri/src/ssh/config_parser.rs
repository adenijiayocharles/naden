use std::io::BufReader;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use ssh2_config::{ParseRule, SshConfig};

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    /// The `Host` block name from the config (e.g. "web-server" or "192.168.1.*")
    pub pattern: String,
    pub hostname: Option<String>,
    pub port: Option<i64>,
    pub username: Option<String>,
    pub identity_file_path: Option<String>,
}

pub fn parse_ssh_config(path: &PathBuf, app: &tauri::AppHandle) -> Result<Vec<ImportPreview>, AppError> {
    use tauri::Manager;
    let home_dir = app.path().home_dir().ok();
    parse_ssh_config_inner(path, home_dir.as_ref())
}

fn parse_ssh_config_inner(path: &PathBuf, home_dir: Option<&std::path::PathBuf>) -> Result<Vec<ImportPreview>, AppError> {
    let file = std::fs::File::open(path).map_err(|e| AppError::Io(e.to_string()))?;
    let mut reader = BufReader::new(file);

    let config = SshConfig::default()
        .parse(&mut reader, ParseRule::ALLOW_UNKNOWN_FIELDS)
        .map_err(|e| AppError::Ssh(format!("failed to parse SSH config: {e}")))?;

    let mut previews = Vec::new();

    for host in config.get_hosts() {
        for clause in &host.pattern {
            // Skip negated entries (e.g. "!secret.host") and wildcard catch-alls
            if clause.negated || clause.pattern == "*" {
                continue;
            }
            let name = clause.pattern.clone();
            let p = &host.params;

            let identity = p
                .identity_file
                .as_ref()
                .and_then(|v| v.first())
                .map(|pb| expand_tilde(pb, home_dir));

            previews.push(ImportPreview {
                pattern: name,
                hostname: p.host_name.clone(),
                port: p.port.map(|n| n as i64),
                username: p.user.clone(),
                identity_file_path: identity,
            });
        }
    }

    Ok(previews)
}

fn expand_tilde(path: &std::path::Path, home_dir: Option<&std::path::PathBuf>) -> String {
    let s = path.to_string_lossy();
    if let Some(rest) = s.strip_prefix("~/") {
        if let Some(home) = home_dir {
            return home.join(rest).to_string_lossy().to_string();
        }
    }
    s.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn write_config(content: &str) -> PathBuf {
        let path = std::env::temp_dir()
            .join(format!("ssh_config_test_{}.conf", uuid::Uuid::new_v4()));
        fs::write(&path, content).expect("write temp config");
        path
    }

    #[test]
    fn parses_basic_host() {
        let path = write_config(
            "Host web\n  HostName 10.0.0.1\n  User ubuntu\n  Port 2222\n",
        );
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
}
