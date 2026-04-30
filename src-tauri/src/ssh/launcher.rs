use crate::error::AppError;
use crate::models::server::ServerWithTags;

fn build_ssh_args(server: &ServerWithTags) -> String {
    let s = &server.server;
    let mut parts = vec!["ssh".to_string()];

    if s.port != 22 {
        parts.push(format!("-p {}", s.port));
    }

    if let Some(ref key) = s.identity_file_path {
        // Single-quote the path so spaces are handled; escape any embedded single quotes
        let escaped = key.replace('\'', "'\\''");
        parts.push(format!("-i '{escaped}'"));
    }

    if !s.username.is_empty() {
        parts.push(format!("{}@{}", s.username, s.hostname));
    } else {
        parts.push(s.hostname.clone());
    }

    parts.join(" ")
}

pub async fn launch_in_system_terminal(server: &ServerWithTags) -> Result<(), AppError> {
    let cmd = build_ssh_args(server);

    #[cfg(target_os = "macos")]
    {
        // Wrap in single quotes inside the AppleScript string to avoid issues with
        // double-quoted path components. The outer AppleScript string uses double quotes.
        let script = format!(
            r#"tell application "Terminal" to do script "{cmd}""#,
            cmd = cmd.replace('"', "'"),
        );
        tokio::process::Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .spawn()
            .map_err(|e| AppError::Ssh(format!("failed to open Terminal.app: {e}")))?;
    }

    #[cfg(target_os = "windows")]
    {
        // Try Windows Terminal first, fall back to cmd
        let launched = tokio::process::Command::new("wt")
            .args(["new-tab", "--", "cmd", "/k", &cmd])
            .spawn();
        if launched.is_err() {
            tokio::process::Command::new("cmd")
                .args(["/c", "start", "cmd", "/k", &cmd])
                .spawn()
                .map_err(|e| AppError::Ssh(format!("failed to open terminal: {e}")))?;
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        for term in ["x-terminal-emulator", "gnome-terminal", "xterm", "konsole"] {
            if tokio::process::Command::new(term)
                .arg("-e")
                .arg(&cmd)
                .spawn()
                .is_ok()
            {
                return Ok(());
            }
        }
        return Err(AppError::Ssh(
            "no supported terminal emulator found on this system".into(),
        ));
    }

    Ok(())
}
