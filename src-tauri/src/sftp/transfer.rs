use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Emitter;

use super::sftp_err;
use crate::error::AppError;

pub(crate) const MAX_UPLOAD_BYTES: u64 = 2 * 1024 * 1024 * 1024; // 2 GB

pub(crate) fn check_upload_size(total: u64) -> Result<(), AppError> {
    if total > MAX_UPLOAD_BYTES {
        return Err(AppError::Io(format!(
            "File too large to upload ({:.1} GB). Maximum is 2 GB.",
            total as f64 / 1_073_741_824.0
        )));
    }
    Ok(())
}

/// Uploads a local file or, recursively, a local directory tree.
pub(crate) fn upload_path(
    sftp: &ssh2::Sftp,
    local_path: &str,
    remote_path: &str,
    session_id: &str,
    app_handle: &tauri::AppHandle,
    overwrite: bool,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<(), AppError> {
    let meta = std::fs::metadata(local_path)
        .map_err(|e| AppError::Io(format!("cannot read local path: {e}")))?;
    if meta.is_dir() {
        upload_directory(
            sftp,
            local_path,
            remote_path,
            session_id,
            app_handle,
            overwrite,
            cancel_flag,
        )
    } else {
        upload_file(
            sftp,
            local_path,
            remote_path,
            session_id,
            app_handle,
            overwrite,
            cancel_flag,
        )
    }
}

pub(crate) fn upload_directory(
    sftp: &ssh2::Sftp,
    local_path: &str,
    remote_path: &str,
    session_id: &str,
    app_handle: &tauri::AppHandle,
    overwrite: bool,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<(), AppError> {
    if !overwrite && sftp.stat(Path::new(remote_path)).is_ok() {
        return Err(AppError::AlreadyExists(remote_path.to_string()));
    }
    if sftp.stat(Path::new(remote_path)).is_err() {
        sftp.mkdir(Path::new(remote_path), 0o755)
            .map_err(|e| sftp_err("create this directory", e))?;
    }

    let entries = std::fs::read_dir(local_path)
        .map_err(|e| AppError::Io(format!("cannot read local directory: {e}")))?;
    for entry in entries {
        let entry = entry.map_err(|e| AppError::Io(format!("cannot read directory entry: {e}")))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let child_local = entry.path().to_string_lossy().into_owned();
        let child_remote = format!("{}/{}", remote_path.trim_end_matches('/'), name);
        upload_path(
            sftp,
            &child_local,
            &child_remote,
            session_id,
            app_handle,
            overwrite,
            cancel_flag,
        )?;
    }
    Ok(())
}

pub(crate) fn upload_file(
    sftp: &ssh2::Sftp,
    local_path: &str,
    remote_path: &str,
    session_id: &str,
    app_handle: &tauri::AppHandle,
    overwrite: bool,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<(), AppError> {
    if !overwrite && sftp.stat(Path::new(remote_path)).is_ok() {
        return Err(AppError::AlreadyExists(remote_path.to_string()));
    }

    let mut local_file = std::fs::File::open(local_path)
        .map_err(|e| AppError::Io(format!("cannot open local file: {e}")))?;
    let total = local_file.metadata().map(|m| m.len()).unwrap_or(0);

    check_upload_size(total)?;

    let mut remote_file = sftp
        .create(Path::new(remote_path))
        .map_err(|e| sftp_err("write to this directory", e))?;

    // Reset before starting so a stale cancellation from a previous transfer
    // doesn't immediately abort this one.
    cancel_flag.store(false, Ordering::Relaxed);

    let result = (|| {
        let mut buf = vec![0u8; 65536];
        let mut written: u64 = 0;
        let throttle = std::time::Duration::from_millis(50);
        let mut last_emit = std::time::Instant::now();

        loop {
            if cancel_flag.load(Ordering::Relaxed) {
                return Err(AppError::Cancelled(remote_path.to_string()));
            }
            let n = local_file
                .read(&mut buf)
                .map_err(|e| AppError::Io(format!("read error: {e}")))?;
            if n == 0 {
                break;
            }
            remote_file
                .write_all(&buf[..n])
                .map_err(|e| AppError::Ssh(format!("Upload failed: {e}")))?;
            written += n as u64;
            let now = std::time::Instant::now();
            if total > 0 && now.duration_since(last_emit) >= throttle {
                last_emit = now;
                let _ = app_handle.emit(
                    &format!("sftp:upload_progress:{session_id}"),
                    serde_json::json!({ "written": written, "total": total }),
                );
            }
        }
        // Always emit a final event so the frontend reaches 100%, even for
        // zero-byte files where the loop above never runs.
        let _ = app_handle.emit(
            &format!("sftp:upload_progress:{session_id}"),
            serde_json::json!({ "written": written, "total": total }),
        );
        Ok(())
    })();

    // Remove the truncated remote file if the upload failed mid-stream so we
    // don't leave a silent, partial file at the destination.
    if result.is_err() {
        let _ = sftp.unlink(Path::new(remote_path));
    }

    result
}

/// Downloads a remote file or, recursively, a remote directory tree.
pub(crate) fn download_path(
    sftp: &ssh2::Sftp,
    remote_path: &str,
    local_path: &str,
    session_id: &str,
    app_handle: &tauri::AppHandle,
    overwrite: bool,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<(), AppError> {
    let stat = sftp
        .stat(Path::new(remote_path))
        .map_err(|e| sftp_err("read this item", e))?;
    if stat.is_dir() {
        download_directory(
            sftp,
            remote_path,
            local_path,
            session_id,
            app_handle,
            overwrite,
            cancel_flag,
        )
    } else {
        download_file(
            sftp,
            remote_path,
            local_path,
            session_id,
            app_handle,
            overwrite,
            cancel_flag,
        )
    }
}

pub(crate) fn download_directory(
    sftp: &ssh2::Sftp,
    remote_path: &str,
    local_path: &str,
    session_id: &str,
    app_handle: &tauri::AppHandle,
    overwrite: bool,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<(), AppError> {
    if !overwrite && Path::new(local_path).exists() {
        return Err(AppError::AlreadyExists(local_path.to_string()));
    }
    if !Path::new(local_path).exists() {
        std::fs::create_dir_all(local_path)
            .map_err(|e| AppError::Io(format!("cannot create local directory: {e}")))?;
    }

    let entries = sftp
        .readdir(Path::new(remote_path))
        .map_err(|e| sftp_err("read this directory", e))?;
    for (path_buf, _) in entries {
        let name = match path_buf.file_name() {
            Some(n) => n.to_string_lossy().into_owned(),
            None => continue,
        };
        if name == "." || name == ".." {
            continue;
        }
        let child_remote = path_buf.to_string_lossy().into_owned();
        let child_local = format!("{}/{}", local_path.trim_end_matches('/'), name);
        download_path(
            sftp,
            &child_remote,
            &child_local,
            session_id,
            app_handle,
            overwrite,
            cancel_flag,
        )?;
    }
    Ok(())
}

pub(crate) fn download_file(
    sftp: &ssh2::Sftp,
    remote_path: &str,
    local_path: &str,
    session_id: &str,
    app_handle: &tauri::AppHandle,
    overwrite: bool,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<(), AppError> {
    if !overwrite && Path::new(local_path).exists() {
        return Err(AppError::AlreadyExists(local_path.to_string()));
    }

    let stat = sftp
        .stat(Path::new(remote_path))
        .map_err(|e| sftp_err("read this file", e))?;
    let total = stat.size.unwrap_or(0);

    let mut remote_file = sftp
        .open(Path::new(remote_path))
        .map_err(|e| sftp_err("read this file", e))?;

    let mut local_file = std::fs::File::create(local_path)
        .map_err(|e| AppError::Io(format!("create local file failed: {e}")))?;

    // Reset before starting so a stale cancellation from a previous transfer
    // doesn't immediately abort this one.
    cancel_flag.store(false, Ordering::Relaxed);

    let result = (|| {
        let mut buf = vec![0u8; 65536];
        let mut read_bytes: u64 = 0;
        let throttle = std::time::Duration::from_millis(50);
        let mut last_emit = std::time::Instant::now();

        loop {
            if cancel_flag.load(Ordering::Relaxed) {
                return Err(AppError::Cancelled(remote_path.to_string()));
            }
            let n = remote_file
                .read(&mut buf)
                .map_err(|e| AppError::Ssh(format!("Download failed: {e}")))?;
            if n == 0 {
                break;
            }
            local_file
                .write_all(&buf[..n])
                .map_err(|e| AppError::Io(format!("write error: {e}")))?;
            read_bytes += n as u64;
            let now = std::time::Instant::now();
            if total > 0 && now.duration_since(last_emit) >= throttle {
                last_emit = now;
                let _ = app_handle.emit(
                    &format!("sftp:download_progress:{session_id}"),
                    serde_json::json!({ "read": read_bytes, "total": total }),
                );
            }
        }
        // Always emit a final event so the frontend reaches 100%, even for
        // zero-byte files where the loop above never runs.
        let _ = app_handle.emit(
            &format!("sftp:download_progress:{session_id}"),
            serde_json::json!({ "read": read_bytes, "total": total }),
        );
        Ok(())
    })();

    // Remove the partial file if the transfer failed mid-stream.
    if result.is_err() {
        let _ = std::fs::remove_file(local_path);
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn check_upload_size_allows_zero_bytes() {
        assert!(check_upload_size(0).is_ok());
    }

    #[test]
    fn check_upload_size_allows_files_under_the_limit() {
        assert!(check_upload_size(1024).is_ok());
    }

    #[test]
    fn check_upload_size_allows_exactly_at_limit() {
        assert!(check_upload_size(MAX_UPLOAD_BYTES).is_ok());
    }

    #[test]
    fn check_upload_size_rejects_files_over_the_limit() {
        assert!(check_upload_size(MAX_UPLOAD_BYTES + 1).is_err());
    }

    #[test]
    fn check_upload_size_rejects_u64_max() {
        assert!(check_upload_size(u64::MAX).is_err());
    }

    #[test]
    fn check_upload_size_error_message_mentions_gb() {
        let err = check_upload_size(MAX_UPLOAD_BYTES + 1).unwrap_err();
        assert!(err.to_string().contains("GB"));
    }
}
