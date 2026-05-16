use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::Emitter;

use crate::error::AppError;
use crate::ssh::connection::{authenticate_session, AuthInfo};
use crate::ssh::jump_host::{self, JumpInfo};

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
        reply: tokio::sync::oneshot::Sender<Result<(), AppError>>,
    },
    UploadFile {
        local_path: String,
        remote_path: String,
        reply: tokio::sync::oneshot::Sender<Result<(), AppError>>,
    },
    DownloadFile {
        remote_path: String,
        local_path: String,
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
    SyncFolder {
        local_path: String,
        remote_path: String,
        reply: tokio::sync::oneshot::Sender<Result<u32, AppError>>,
    },
    Close,
}

/// Tracks a file being live-edited: temp path on disk and last seen mtime.
struct WatchedFile {
    temp_path: String,
    last_mtime: Option<std::time::SystemTime>,
}

struct SftpSessionHandle {
    tx: std::sync::mpsc::SyncSender<SftpMessage>,
}

pub struct SftpManager {
    sessions: Arc<Mutex<HashMap<String, SftpSessionHandle>>>,
}

impl SftpManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn open_session(
        &self,
        session_id: String,
        host: String,
        port: u16,
        username: String,
        auth: AuthInfo,
        jump_chain: Vec<JumpInfo>,
        app_handle: tauri::AppHandle,
    ) -> Result<(), AppError> {
        let (tx, rx) = std::sync::mpsc::sync_channel(64);

        self.sessions
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(session_id.clone(), SftpSessionHandle { tx });

        let sessions = Arc::clone(&self.sessions);
        let sid = session_id;

        std::thread::spawn(move || {
            run_sftp_session(host, port, username, auth, jump_chain, sid, rx, app_handle, sessions);
        });

        Ok(())
    }

    pub(crate) fn send(&self, session_id: &str, msg: SftpMessage) -> Result<(), AppError> {
        let sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
        let handle = sessions
            .get(session_id)
            .ok_or_else(|| AppError::Ssh(format!("SFTP session {session_id} not found")))?;
        handle
            .tx
            .send(msg)
            .map_err(|_| AppError::Ssh("SFTP session closed".into()))
    }

    pub fn close_session(&self, session_id: &str) {
        if let Some(handle) = self.sessions.lock().unwrap_or_else(|e| e.into_inner()).get(session_id) {
            let _ = handle.tx.send(SftpMessage::Close);
        }
    }
}

/// RAII guard that removes the session from the map when it goes out of scope,
/// even if the thread panics.
struct SessionGuard<'a> {
    sessions: &'a Arc<Mutex<HashMap<String, SftpSessionHandle>>>,
    id: &'a str,
}

impl Drop for SessionGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut map) = self.sessions.lock() {
            map.remove(self.id);
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn run_sftp_session(
    host: String,
    port: u16,
    username: String,
    auth: AuthInfo,
    jump_chain: Vec<JumpInfo>,
    session_id: String,
    rx: std::sync::mpsc::Receiver<SftpMessage>,
    app_handle: tauri::AppHandle,
    sessions: Arc<Mutex<HashMap<String, SftpSessionHandle>>>,
) {
    // Guarantees removal from the sessions map on exit, including panics.
    let _guard = SessionGuard { sessions: &sessions, id: &session_id };

    let _ = app_handle.emit(&format!("sftp:status:{session_id}"), "connecting");

    let result: Result<(), AppError> = (|| {
        let stream = if jump_chain.is_empty() {
            crate::ssh::connection::tcp_connect(&host, port)?
        } else {
            jump_host::open_tunnel(jump_chain, &host, port)?
        };

        let mut session = ssh2::Session::new()
            .map_err(|e| AppError::Ssh(format!("SSH session create failed: {e}")))?;
        session.set_tcp_stream(stream);
        session
            .handshake()
            .map_err(|e| AppError::Ssh(format!("SSH handshake failed: {e}")))?;

        authenticate_session(&mut session, &username, &auth)?;

        if !session.authenticated() {
            return Err(AppError::Ssh("Authentication failed".into()));
        }

        let sftp = session
            .sftp()
            .map_err(|e| AppError::Ssh(format!("SFTP subsystem failed: {e}")))?;

        let _ = app_handle.emit(&format!("sftp:status:{session_id}"), "connected");

        // Map of remote_path -> WatchedFile for live-edit tracking.
        let mut watched: HashMap<String, WatchedFile> = HashMap::new();

        loop {
            match rx.recv_timeout(std::time::Duration::from_millis(1000)) {
                Ok(SftpMessage::Close) | Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    // Poll watched files for changes and re-upload if mtime changed.
                    for (remote_path, wf) in watched.iter_mut() {
                        let Ok(meta) = std::fs::metadata(&wf.temp_path) else { continue };
                        let Ok(mtime) = meta.modified() else { continue };
                        if wf.last_mtime.map_or(true, |prev| mtime > prev) {
                            wf.last_mtime = Some(mtime);
                            if upload_file(&sftp, &wf.temp_path, remote_path, &session_id, &app_handle).is_ok() {
                                let _ = app_handle.emit(
                                    &format!("sftp:file_synced:{session_id}"),
                                    remote_path.clone(),
                                );
                            }
                        }
                    }
                }
                Ok(msg) => handle_message(msg, &sftp, &session_id, &app_handle, &mut watched),
            }
        }

        // Cleanup: remove all temp files for this session.
        for (_, wf) in watched.drain() {
            let _ = std::fs::remove_file(&wf.temp_path);
        }

        Ok(())
    })();

    if let Err(e) = result {
        let _ = app_handle.emit(&format!("sftp:error:{session_id}"), e.to_string());
    }

    let _ = app_handle.emit(&format!("sftp:closed:{session_id}"), ());
}

/// Translate an ssh2 SFTP error into a human-readable AppError.
/// SFTP status codes come from RFC 4251 §7 / SSH protocol:
///   2 = SSH_FX_NO_SUCH_FILE, 3 = SSH_FX_PERMISSION_DENIED
fn sftp_err(action: &str, e: ssh2::Error) -> AppError {
    let msg = match e.code() {
        ssh2::ErrorCode::SFTP(3) => {
            format!("Permission denied — your SSH user does not have permission to {action}")
        }
        ssh2::ErrorCode::SFTP(2) => "No such file or directory".to_string(),
        _ => format!("Failed to {action}: {e}"),
    };
    AppError::Ssh(msg)
}

fn handle_message(
    msg: SftpMessage,
    sftp: &ssh2::Sftp,
    session_id: &str,
    app_handle: &tauri::AppHandle,
    watched: &mut HashMap<String, WatchedFile>,
) {
    match msg {
        SftpMessage::ListDir { path, reply } => {
            let _ = reply.send(list_dir(sftp, &path));
        }
        SftpMessage::MkDir { path, reply } => {
            let result = sftp
                .mkdir(Path::new(&path), 0o755)
                .map_err(|e| sftp_err("create this directory", e));
            let _ = reply.send(result);
        }
        SftpMessage::Delete { path, reply } => {
            let _ = reply.send(delete_entry(sftp, &path));
        }
        SftpMessage::Rename { from, to, reply } => {
            let result = sftp
                .rename(Path::new(&from), Path::new(&to), None)
                .map_err(|e| sftp_err("rename this item", e));
            let _ = reply.send(result);
        }
        SftpMessage::UploadFile { local_path, remote_path, reply } => {
            let result = upload_file(sftp, &local_path, &remote_path, session_id, app_handle);
            let _ = reply.send(result);
        }
        SftpMessage::DownloadFile { remote_path, local_path, reply } => {
            let result = download_file(sftp, &remote_path, &local_path, session_id, app_handle);
            let _ = reply.send(result);
        }
        SftpMessage::TouchFile { path, reply } => {
            let result = sftp
                .create(Path::new(&path))
                .map(|_| ())
                .map_err(|e| sftp_err("create this file", e));
            let _ = reply.send(result);
        }
        SftpMessage::SetPermissions { path, mode, reply } => {
            let stat = ssh2::FileStat {
                size: None,
                uid: None,
                gid: None,
                perm: Some(mode),
                atime: None,
                mtime: None,
            };
            let result = sftp
                .setstat(Path::new(&path), stat)
                .map_err(|e| sftp_err("set permissions on this file", e));
            let _ = reply.send(result);
        }
        SftpMessage::OpenEdit { path, reply } => {
            let _ = reply.send(open_edit(sftp, &path, session_id, app_handle, watched));
        }
        SftpMessage::CloseEdit { remote_path, reply } => {
            let result = if let Some(wf) = watched.remove(&remote_path) {
                let _ = std::fs::remove_file(&wf.temp_path);
                Ok(())
            } else {
                Ok(())
            };
            let _ = reply.send(result);
        }
        SftpMessage::SyncFolder { local_path, remote_path, reply } => {
            let result = sync_folder(sftp, &local_path, &remote_path, session_id, app_handle);
            let _ = reply.send(result);
        }
        SftpMessage::Close => {}
    }
}

fn list_dir(sftp: &ssh2::Sftp, path: &str) -> Result<DirListing, AppError> {
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
            let is_symlink = stat.perm.map_or(false, |p| p & 0o170000 == 0o120000);
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

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(DirListing {
        path: resolved.to_string_lossy().into_owned(),
        entries,
    })
}

fn delete_entry(sftp: &ssh2::Sftp, path: &str) -> Result<(), AppError> {
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

const MAX_UPLOAD_BYTES: u64 = 2 * 1024 * 1024 * 1024; // 2 GB

fn upload_file(
    sftp: &ssh2::Sftp,
    local_path: &str,
    remote_path: &str,
    session_id: &str,
    app_handle: &tauri::AppHandle,
) -> Result<(), AppError> {
    let mut local_file = std::fs::File::open(local_path)
        .map_err(|e| AppError::Io(format!("cannot open local file: {e}")))?;
    let total = local_file.metadata().map(|m| m.len()).unwrap_or(0);

    if total > MAX_UPLOAD_BYTES {
        return Err(AppError::Io(format!(
            "File too large to upload ({:.1} GB). Maximum is 2 GB.",
            total as f64 / 1_073_741_824.0
        )));
    }

    let mut remote_file = sftp
        .create(Path::new(remote_path))
        .map_err(|e| sftp_err("write to this directory", e))?;

    let mut buf = vec![0u8; 65536];
    let mut written: u64 = 0;

    loop {
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
        if total > 0 {
            let _ = app_handle.emit(
                &format!("sftp:upload_progress:{session_id}"),
                serde_json::json!({ "written": written, "total": total }),
            );
        }
    }

    Ok(())
}

fn open_edit(
    sftp: &ssh2::Sftp,
    remote_path: &str,
    session_id: &str,
    app_handle: &tauri::AppHandle,
    watched: &mut HashMap<String, WatchedFile>,
) -> Result<String, AppError> {
    let filename = Path::new(remote_path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "file".to_string());

    // Build temp dir: <os_tmp>/ssh-manager/<session_id>/
    let temp_dir = std::env::temp_dir()
        .join("ssh-manager")
        .join(session_id);
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| AppError::Io(format!("cannot create temp dir: {e}")))?;

    let temp_path = temp_dir.join(&filename);
    let temp_path_str = temp_path.to_string_lossy().into_owned();

    // Download the file to temp location.
    download_file(sftp, remote_path, &temp_path_str, session_id, app_handle)?;

    // Read initial mtime.
    let last_mtime = std::fs::metadata(&temp_path).ok().and_then(|m| m.modified().ok());

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

    watched.insert(remote_path.to_string(), WatchedFile {
        temp_path: temp_path_str.clone(),
        last_mtime,
    });

    Ok(temp_path_str)
}

/// Recursively sync a local directory to a remote path.
/// Returns the total number of files uploaded.
fn sync_folder(
    sftp: &ssh2::Sftp,
    local_path: &str,
    remote_path: &str,
    session_id: &str,
    app_handle: &tauri::AppHandle,
) -> Result<u32, AppError> {
    sync_folder_recursive(sftp, local_path, remote_path, session_id, app_handle)
}

fn sync_folder_recursive(
    sftp: &ssh2::Sftp,
    local_path: &str,
    remote_path: &str,
    session_id: &str,
    app_handle: &tauri::AppHandle,
) -> Result<u32, AppError> {
    // Ensure the remote directory exists.
    if sftp.stat(Path::new(remote_path)).is_err() {
        sftp.mkdir(Path::new(remote_path), 0o755)
            .map_err(|e| sftp_err("create remote directory", e))?;
    }

    let read_dir = std::fs::read_dir(local_path)
        .map_err(|e| AppError::Io(format!("cannot read local directory: {e}")))?;

    let mut count: u32 = 0;

    for entry in read_dir.flatten() {
        let local_entry_path = entry.path();
        let local_entry_str = local_entry_path.to_string_lossy().into_owned();
        let file_name = entry.file_name().to_string_lossy().into_owned();
        let remote_entry_path = format!("{}/{}", remote_path.trim_end_matches('/'), file_name);

        let file_type = entry.file_type().map_err(|e| AppError::Io(format!("stat error: {e}")))?;

        if file_type.is_dir() {
            count += sync_folder_recursive(sftp, &local_entry_str, &remote_entry_path, session_id, app_handle)?;
        } else if file_type.is_file() {
            // Compare local mtime vs remote mtime.
            let should_upload = match (
                std::fs::metadata(&local_entry_path).and_then(|m| m.modified()),
                sftp.stat(Path::new(&remote_entry_path)).ok(),
            ) {
                (Ok(local_mtime), Some(remote_stat)) => {
                    let local_secs = local_mtime
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    let remote_secs = remote_stat.mtime.unwrap_or(0);
                    local_secs > remote_secs
                }
                (Ok(_), None) => true, // Remote doesn't exist — upload.
                _ => true,             // Cannot stat — upload to be safe.
            };

            if should_upload {
                upload_file(sftp, &local_entry_str, &remote_entry_path, session_id, app_handle)?;
                count += 1;
                let _ = app_handle.emit(
                    &format!("sftp:sync_progress:{session_id}"),
                    serde_json::json!({ "file": remote_entry_path, "count": count }),
                );
            }
        }
    }

    Ok(count)
}

fn download_file(
    sftp: &ssh2::Sftp,
    remote_path: &str,
    local_path: &str,
    session_id: &str,
    app_handle: &tauri::AppHandle,
) -> Result<(), AppError> {
    let stat = sftp
        .stat(Path::new(remote_path))
        .map_err(|e| sftp_err("read this file", e))?;
    let total = stat.size.unwrap_or(0);

    let mut remote_file = sftp
        .open(Path::new(remote_path))
        .map_err(|e| sftp_err("read this file", e))?;

    let mut local_file = std::fs::File::create(local_path)
        .map_err(|e| AppError::Io(format!("create local file failed: {e}")))?;

    let result = (|| {
        let mut buf = vec![0u8; 65536];
        let mut read_bytes: u64 = 0;

        loop {
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
            if total > 0 {
                let _ = app_handle.emit(
                    &format!("sftp:download_progress:{session_id}"),
                    serde_json::json!({ "read": read_bytes, "total": total }),
                );
            }
        }
        Ok(())
    })();

    // Remove the partial file if the transfer failed mid-stream.
    if result.is_err() {
        let _ = std::fs::remove_file(local_path);
    }

    result
}
