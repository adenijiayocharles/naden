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
    /// First entry from `ProxyJump` — the pattern name of the jump host.
    pub proxy_jump: Option<String>,
}

pub fn parse_ssh_config(
    path: &PathBuf,
    app: &tauri::AppHandle,
) -> Result<Vec<ImportPreview>, AppError> {
    use tauri::Manager;
    let home_dir = app.path().home_dir().ok();
    parse_ssh_config_inner(path, home_dir.as_ref())
}

fn parse_ssh_config_inner(
    path: &PathBuf,
    home_dir: Option<&std::path::PathBuf>,
) -> Result<Vec<ImportPreview>, AppError> {
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

            let proxy_jump = p.proxy_jump.as_ref().and_then(|v| v.first()).cloned();

            previews.push(ImportPreview {
                pattern: name,
                hostname: p.host_name.clone(),
                port: p.port.map(|n| n as i64),
                username: p.user.clone(),
                identity_file_path: identity,
                proxy_jump,
            });
        }
    }

    Ok(previews)
}

const MANAGED_BEGIN: &str = "# BEGIN NADEN MANAGED";
const MANAGED_END: &str = "# END NADEN MANAGED";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportServer {
    pub display_name: String,
    pub hostname: String,
    pub port: i64,
    pub username: String,
    pub identity_file_path: Option<String>,
}

/// Build the `# BEGIN NADEN MANAGED` / `# END NADEN MANAGED` block.
pub fn build_managed_block(servers: &[ExportServer]) -> String {
    let mut block =
        format!("{MANAGED_BEGIN}\n# Managed by Naden — do not edit this block manually.\n");
    for s in servers {
        let alias = sanitize_host_alias(&s.display_name);
        block.push_str(&format!("\nHost {alias}\n"));
        block.push_str(&format!("  HostName {}\n", s.hostname));
        if s.port != 22 {
            block.push_str(&format!("  Port {}\n", s.port));
        }
        if !s.username.is_empty() {
            block.push_str(&format!("  User {}\n", s.username));
        }
        if let Some(ref key) = s.identity_file_path {
            if !key.is_empty() {
                block.push_str(&format!("  IdentityFile {key}\n"));
            }
        }
    }
    block.push('\n');
    block.push_str(MANAGED_END);
    block.push('\n');
    block
}

/// Replace any existing managed block in `existing` with `new_block`, or append it.
pub fn merge_managed_block(existing: &str, new_block: &str) -> String {
    if let (Some(begin), Some(end_pos)) = (existing.find(MANAGED_BEGIN), existing.find(MANAGED_END))
    {
        let end = end_pos + MANAGED_END.len();
        let after_end = if existing.as_bytes().get(end) == Some(&b'\n') {
            end + 1
        } else {
            end
        };
        let prefix = existing[..begin].trim_end_matches('\n');
        let suffix = existing[after_end..].trim_start_matches('\n');

        let mut result = String::new();
        if !prefix.is_empty() {
            result.push_str(prefix);
            result.push_str("\n\n");
        }
        result.push_str(new_block);
        if !suffix.is_empty() {
            result.push('\n');
            result.push_str(suffix);
            if !suffix.ends_with('\n') {
                result.push('\n');
            }
        }
        result
    } else {
        let prefix = existing.trim_end_matches('\n');
        let mut result = prefix.to_string();
        if !result.is_empty() {
            result.push_str("\n\n");
        }
        result.push_str(new_block);
        result
    }
}

fn sanitize_host_alias(name: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '.' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    s.trim_matches('-').to_string()
}

pub(crate) fn expand_tilde(
    path: &std::path::Path,
    home_dir: Option<&std::path::PathBuf>,
) -> String {
    let s = path.to_string_lossy();
    if let Some(rest) = s.strip_prefix("~/") {
        if let Some(home) = home_dir {
            return home.join(rest).to_string_lossy().to_string();
        }
    }
    s.to_string()
}

#[cfg(test)]
#[path = "config_parser_tests.rs"]
mod tests;
