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

pub fn parse_ssh_config(path: &PathBuf) -> Result<Vec<ImportPreview>, AppError> {
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
                .map(|pb| expand_tilde(pb));

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

fn expand_tilde(path: &std::path::Path) -> String {
    let s = path.to_string_lossy();
    if let Some(rest) = s.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest).to_string_lossy().to_string();
        }
    }
    s.to_string()
}
