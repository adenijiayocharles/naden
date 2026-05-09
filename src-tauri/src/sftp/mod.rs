use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use uuid::Uuid;

use crate::error::AppError;
use crate::ssh::connection::{authenticate_session, AuthInfo};
use crate::ssh::jump_host::{self, JumpInfo};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
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
    Close,
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
        host: String,
        port: u16,
        username: String,
        auth: AuthInfo,
        jump_chain: Vec<JumpInfo>,
        app_handle: tauri::AppHandle,
    ) -> Result<String, AppError> {
        let session_id = Uuid::new_v4().to_string();
        let (tx, rx) = std::sync::mpsc::sync_channel(64);

        self.sessions
            .lock()
            .unwrap()
            .insert(session_id.clone(), SftpSessionHandle { tx });

        let sessions = Arc::clone(&self.sessions);
        let sid = session_id.clone();

        std::thread::spawn(move || {
            run_sftp_session(host, port, username, auth, jump_chain, sid, rx, app_handle, sessions);
        });

        Ok(session_id)
    }

    pub(crate) fn send(&self, session_id: &str, msg: SftpMessage) -> Result<(), AppError> {
        let sessions = self.sessions.lock().unwrap();
        let handle = sessions
            .get(session_id)
            .ok_or_else(|| AppError::Ssh(format!("SFTP session {session_id} not found")))?;
        handle
            .tx
            .send(msg)
            .map_err(|_| AppError::Ssh("SFTP session closed".into()))
    }

    pub fn close_session(&self, session_id: &str) {
        if let Some(handle) = self.sessions.lock().unwrap().get(session_id) {
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

        loop {
            match rx.recv() {
                Ok(SftpMessage::Close) | Err(_) => break,
                Ok(msg) => handle_message(msg, &sftp, &session_id, &app_handle),
            }
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
            Some(FileEntry {
                path: path_buf.to_string_lossy().into_owned(),
                name,
                is_dir: stat.is_dir(),
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
