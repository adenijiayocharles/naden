use crate::error::AppError;
use crate::models::server::ServerWithTags;

/// Build SSH argument vector. Each element is a distinct argument — never joined
/// into a shell string, so no shell metacharacter in hostname/username can be executed.
fn build_ssh_argv(server: &ServerWithTags) -> Vec<String> {
    let s = &server.server;
    let mut args = vec!["ssh".to_string()];

    if s.port != 22 {
        args.push("-p".to_string());
        args.push(s.port.to_string());
    }

    if let Some(ref key) = s.identity_file_path {
        args.push("-i".to_string());
        args.push(key.clone());
    }

    if !s.username.is_empty() {
        args.push(format!("{}@{}", s.username, s.hostname));
    } else {
        args.push(s.hostname.clone());
    }

    args
}

pub async fn launch_in_system_terminal(server: &ServerWithTags) -> Result<(), AppError> {
    let argv = build_ssh_argv(server);

    #[cfg(target_os = "macos")]
    launch_macos(argv).await?;

    #[cfg(target_os = "windows")]
    launch_windows(argv).await?;

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    launch_linux(argv).await?;

    Ok(())
}

/// macOS: write user-supplied data into a temp shell script; the AppleScript string
/// contains only the UUID-based file path (which we control), not the SSH arguments.
#[cfg(target_os = "macos")]
async fn launch_macos(argv: Vec<String>) -> Result<(), AppError> {
    use std::os::unix::fs::PermissionsExt;

    let script_path = std::env::temp_dir()
        .join(format!("ssh-manager-{}.sh", uuid::Uuid::new_v4()));

    // POSIX single-quote-wrap each argument for the script body.
    let shell_cmd = argv
        .iter()
        .map(|a| format!("'{}'", a.replace('\'', "'\\''")))
        .collect::<Vec<_>>()
        .join(" ");

    std::fs::write(&script_path, format!("#!/bin/sh\nexec {shell_cmd}\n"))?;
    std::fs::set_permissions(&script_path, std::fs::Permissions::from_mode(0o700))?;

    // Only our UUID-based temp path enters the AppleScript string — no user data.
    let path_str = script_path.display().to_string();
    let applescript = format!(r#"tell application "Terminal" to do script "{path_str}""#);

    let out = tokio::process::Command::new("osascript")
        .arg("-e")
        .arg(&applescript)
        .output()
        .await
        .map_err(|e| AppError::Ssh(format!("failed to run osascript: {e}")))?;

    if !out.status.success() {
        let _ = std::fs::remove_file(&script_path);
        let msg = String::from_utf8_lossy(&out.stderr);
        return Err(AppError::Ssh(format!(
            "Terminal.app did not open — {}. \
             Grant Automation permission in System Settings → Privacy & Security → Automation.",
            msg.trim()
        )));
    }

    // Terminal reads the script file asynchronously after osascript returns.
    // Remove after a short delay to ensure Terminal has time to exec it.
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        let _ = std::fs::remove_file(&script_path);
    });

    Ok(())
}

/// Windows: write a temp batch file so user-supplied data never becomes part of
/// a shell string passed to cmd.exe.
#[cfg(target_os = "windows")]
async fn launch_windows(argv: Vec<String>) -> Result<(), AppError> {
    let script_path = std::env::temp_dir()
        .join(format!("ssh-manager-{}.bat", uuid::Uuid::new_v4()));

    // Batch double-quote each argument; double any internal double-quotes.
    let bat_args = argv
        .iter()
        .map(|a| format!("\"{}\"", a.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" ");

    std::fs::write(&script_path, format!("@echo off\r\n{bat_args}\r\npause\r\n"))?;

    let path_str = script_path.display().to_string();

    let launched = tokio::process::Command::new("wt")
        .args(["new-tab", "--", "cmd", "/c", &path_str])
        .spawn();

    if launched.is_err() {
        tokio::process::Command::new("cmd")
            .args(["/c", "start", "cmd", "/k", &path_str])
            .spawn()
            .map_err(|e| AppError::Ssh(format!("failed to open terminal: {e}")))?;
    }

    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        let _ = std::fs::remove_file(&script_path);
    });

    Ok(())
}

/// Linux: pass argv as separate tokens to the terminal emulator — no shell string.
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
async fn launch_linux(argv: Vec<String>) -> Result<(), AppError> {
    // gnome-terminal uses `--` as the separator; others use `-e`.
    for (term, flag) in [
        ("x-terminal-emulator", "-e"),
        ("gnome-terminal", "--"),
        ("xterm", "-e"),
        ("konsole", "-e"),
    ] {
        if tokio::process::Command::new(term)
            .arg(flag)
            .args(&argv)
            .spawn()
            .is_ok()
        {
            return Ok(());
        }
    }
    Err(AppError::Ssh(
        "no supported terminal emulator found on this system".into(),
    ))
}
