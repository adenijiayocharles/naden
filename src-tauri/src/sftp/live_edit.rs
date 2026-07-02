use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use super::is_edit_allowed;
use super::transfer::download_file;
use crate::error::AppError;

/// Tracks a file being live-edited: temp path on disk and last seen mtime.
pub(crate) struct WatchedFile {
    pub(crate) temp_path: String,
    pub(crate) last_mtime: Option<std::time::SystemTime>,
    /// Instant of the last successful re-upload, used to debounce rapid saves.
    pub(crate) last_upload_at: Option<std::time::Instant>,
}

pub(crate) fn open_edit(
    sftp: &ssh2::Sftp,
    remote_path: &str,
    session_id: &str,
    app_handle: &tauri::AppHandle,
    watched: &mut HashMap<String, WatchedFile>,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<String, AppError> {
    let filename = Path::new(remote_path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "file".to_string());

    // Reject file types not on the safe-to-edit allowlist to prevent accidentally
    // opening executables, binaries, or other dangerous file types.
    if !is_edit_allowed(&filename) {
        return Err(AppError::Io(
            "File type not supported for editing: use Download instead".into(),
        ));
    }

    // Build temp dir: <os_tmp>/naden/<session_id>/
    // Mode 0700 prevents other local users from reading files being edited.
    let temp_dir = std::env::temp_dir().join("naden").join(session_id);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt as _;
        std::fs::DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(&temp_dir)
            .map_err(|e| AppError::Io(format!("cannot create temp dir: {e}")))?;
    }
    #[cfg(not(unix))]
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| AppError::Io(format!("cannot create temp dir: {e}")))?;

    // Prefix with a UUID so two files with the same base name in the same session
    // never share a temp path — they would otherwise clobber each other on download
    // and the poll loop would re-upload the wrong content to the remote.
    let unique_name = format!("{}-{}", uuid::Uuid::new_v4().simple(), filename);
    let temp_path = temp_dir.join(&unique_name);
    let temp_path_str = temp_path.to_string_lossy().into_owned();

    // Download the file to temp location.
    download_file(
        sftp,
        remote_path,
        &temp_path_str,
        session_id,
        app_handle,
        true,
        cancel_flag,
    )?;

    // Read initial mtime.
    let last_mtime = std::fs::metadata(&temp_path)
        .ok()
        .and_then(|m| m.modified().ok());

    // Open with platform default application.
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&temp_path)
        .spawn()
        .map_err(|e| AppError::Io(format!("cannot open file: {e}")))?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&temp_path)
        .spawn()
        .map_err(|e| AppError::Io(format!("cannot open file: {e}")))?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/c", "start", "", &temp_path_str])
        .spawn()
        .map_err(|e| AppError::Io(format!("cannot open file: {e}")))?;

    watched.insert(
        remote_path.to_string(),
        WatchedFile {
            temp_path: temp_path_str.clone(),
            last_mtime,
            last_upload_at: None,
        },
    );

    Ok(temp_path_str)
}
