use std::path::Path;

use crate::error::AppError;

mod archive;
mod live_edit;
mod session;
mod transfer;

pub use session::SftpManager;

/// Extensions (lowercase, without leading dot) that are safe to open in the
/// user's default text editor via `open`/`xdg-open`. Files with no extension
/// are also permitted (treated as plain text).
///
/// Shell and interpreter extensions are intentionally excluded: opening a
/// `.sh`, `.py`, `.rb` etc. file with the system default handler can execute
/// it directly depending on the user's file associations, which would allow a
/// malicious SFTP server to run arbitrary code on the local machine.
const EDIT_ALLOWED_EXTENSIONS: &[&str] = &[
    "txt",
    "md",
    "rs",
    "js",
    "ts",
    "tsx",
    "jsx",
    "json",
    "toml",
    "yaml",
    "yml",
    "conf",
    "cfg",
    "ini",
    "env",
    "sql",
    "html",
    "css",
    "php",
    "xml",
    "log",
    "csv",
    "go",
    "c",
    "h",
    "cpp",
    "java",
    "kt",
    "swift",
    "gitignore",
];

/// True if `filename`'s extension is on [`EDIT_ALLOWED_EXTENSIONS`], or it has
/// no extension (treated as plain text).
pub(crate) fn is_edit_allowed(filename: &str) -> bool {
    match Path::new(filename).extension() {
        Some(ext) => {
            EDIT_ALLOWED_EXTENSIONS.contains(&ext.to_string_lossy().to_lowercase().as_str())
        }
        None => true,
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub modified: Option<i64>,
    pub permissions: Option<u32>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirListing {
    pub path: String,
    pub entries: Vec<FileEntry>,
}

pub(crate) enum SftpMessage {
    ListDir {
        path: String,
        reply: tokio::sync::oneshot::Sender<Result<DirListing, AppError>>,
    },
    MkDir {
        path: String,
        reply: tokio::sync::oneshot::Sender<Result<(), AppError>>,
    },
    Delete {
        path: String,
        reply: tokio::sync::oneshot::Sender<Result<(), AppError>>,
    },
    Rename {
        from: String,
        to: String,
        overwrite: bool,
        reply: tokio::sync::oneshot::Sender<Result<(), AppError>>,
    },
    UploadFile {
        local_path: String,
        remote_path: String,
        overwrite: bool,
        reply: tokio::sync::oneshot::Sender<Result<(), AppError>>,
    },
    DownloadFile {
        remote_path: String,
        local_path: String,
        overwrite: bool,
        reply: tokio::sync::oneshot::Sender<Result<(), AppError>>,
    },
    TouchFile {
        path: String,
        reply: tokio::sync::oneshot::Sender<Result<(), AppError>>,
    },
    SetPermissions {
        path: String,
        mode: u32,
        reply: tokio::sync::oneshot::Sender<Result<(), AppError>>,
    },
    OpenEdit {
        path: String,
        reply: tokio::sync::oneshot::Sender<Result<String, AppError>>,
    },
    CloseEdit {
        remote_path: String,
        reply: tokio::sync::oneshot::Sender<Result<(), AppError>>,
    },
    CopyFile {
        src: String,
        dest: String,
        overwrite: bool,
        reply: tokio::sync::oneshot::Sender<Result<(), AppError>>,
    },
    DownloadAsZip {
        remote_paths: Vec<String>,
        local_path: String,
        reply: tokio::sync::oneshot::Sender<Result<(), AppError>>,
    },
    UnzipHere {
        remote_zip_path: String,
        remote_dir: String,
        reply: tokio::sync::oneshot::Sender<Result<(), AppError>>,
    },
    Close,
}

/// Translate an ssh2 SFTP error into a human-readable AppError.
/// SFTP status codes come from RFC 4251 §7 / SSH protocol:
///   2 = SSH_FX_NO_SUCH_FILE, 3 = SSH_FX_PERMISSION_DENIED
pub(crate) fn sftp_err(action: &str, e: ssh2::Error) -> AppError {
    let msg = match e.code() {
        ssh2::ErrorCode::SFTP(3) => {
            format!("Permission denied — your SSH user does not have permission to {action}")
        }
        ssh2::ErrorCode::SFTP(2) => "No such file or directory".to_string(),
        _ => format!("Failed to {action}: {e}"),
    };
    AppError::Ssh(msg)
}

/// Sorts directory entries: directories before files, then case-insensitive
/// alphabetical order within each group.
pub(crate) fn sort_entries(entries: &mut [FileEntry]) {
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
}

pub(crate) fn list_dir(sftp: &ssh2::Sftp, path: &str) -> Result<DirListing, AppError> {
    let resolved = sftp
        .realpath(Path::new(if path.is_empty() { "." } else { path }))
        .map_err(|e| sftp_err("resolve this path", e))?;

    let raw = sftp
        .readdir(&resolved)
        .map_err(|e| sftp_err("read this directory", e))?;

    let mut entries: Vec<FileEntry> = raw
        .into_iter()
        .filter_map(|(path_buf, stat)| {
            let name = path_buf.file_name()?.to_string_lossy().into_owned();
            if name == "." || name == ".." {
                return None;
            }
            let is_symlink = stat.perm.is_some_and(|p| p & 0o170000 == 0o120000);
            Some(FileEntry {
                path: path_buf.to_string_lossy().into_owned(),
                name,
                is_dir: stat.is_dir(),
                is_symlink,
                size: stat.size.unwrap_or(0),
                modified: stat.mtime.map(|t| t as i64),
                permissions: stat.perm,
            })
        })
        .collect();

    sort_entries(&mut entries);

    Ok(DirListing {
        path: resolved.to_string_lossy().into_owned(),
        entries,
    })
}

pub(crate) fn delete_entry(sftp: &ssh2::Sftp, path: &str) -> Result<(), AppError> {
    let unlink_err = match sftp.unlink(Path::new(path)) {
        Ok(()) => return Ok(()),
        Err(e) => e,
    };
    // Permission denied on unlink — no point trying rmdir
    if matches!(unlink_err.code(), ssh2::ErrorCode::SFTP(3)) {
        return Err(sftp_err("delete this file", unlink_err));
    }
    // Any other error (e.g. SSH_FX_FAILURE = "is a directory") → try rmdir
    sftp.rmdir(Path::new(path))
        .map_err(|e| sftp_err("delete this directory", e))
}

#[cfg(test)]
mod tests;
