use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::Emitter;

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

use crate::error::AppError;
use crate::ssh::connection::{authenticate_session, verify_host_key, AuthInfo};
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
    Close,
}

/// Tracks a file being live-edited: temp path on disk and last seen mtime.
struct WatchedFile {
    temp_path: String,
    last_mtime: Option<std::time::SystemTime>,
    /// Instant of the last successful re-upload, used to debounce rapid saves.
    last_upload_at: Option<std::time::Instant>,
}

struct SftpSessionHandle {
    tx: std::sync::mpsc::SyncSender<SftpMessage>,
    cancel_flag: Arc<AtomicBool>,
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
        let cancel_flag = Arc::new(AtomicBool::new(false));

        self.sessions
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(
                session_id.clone(),
                SftpSessionHandle {
                    tx,
                    cancel_flag: Arc::clone(&cancel_flag),
                },
            );

        let sessions = Arc::clone(&self.sessions);
        let sid = session_id;

        std::thread::spawn(move || {
            run_sftp_session(
                host,
                port,
                username,
                auth,
                jump_chain,
                sid,
                rx,
                app_handle,
                sessions,
                cancel_flag,
            );
        });

        Ok(())
    }

    /// Signals the session's in-progress transfer (if any) to abort. The
    /// flag is reset at the start of each transfer, so this has no effect
    /// when no transfer is running.
    pub fn cancel_transfer(&self, session_id: &str) {
        if let Some(handle) = self
            .sessions
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(session_id)
        {
            handle.cancel_flag.store(true, Ordering::Relaxed);
        }
    }

    pub(crate) fn send(&self, session_id: &str, msg: SftpMessage) -> Result<(), AppError> {
        // Clone the sender before releasing the lock so we don't hold the mutex
        // during send(), which blocks when the 64-slot channel is full.
        let tx = {
            let sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
            sessions
                .get(session_id)
                .ok_or_else(|| AppError::Ssh(format!("SFTP session {session_id} not found")))?
                .tx
                .clone()
        };
        tx.send(msg)
            .map_err(|_| AppError::Ssh("SFTP session closed".into()))
    }

    pub fn close_session(&self, session_id: &str) {
        if let Some(handle) = self
            .sessions
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(session_id)
        {
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
        self.sessions
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(self.id);
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
    cancel_flag: Arc<AtomicBool>,
) {
    // Guarantees removal from the sessions map on exit, including panics.
    let _guard = SessionGuard {
        sessions: &sessions,
        id: &session_id,
    };

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

        verify_host_key(&session, &host, port)?;
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
                Ok(SftpMessage::Close) | Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    break
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    // Skip the stat loop entirely when nothing is being edited.
                    if watched.is_empty() {
                        continue;
                    }
                    // Poll watched files for changes and re-upload if mtime changed.
                    // Uploads are debounced to at most once per 500 ms per file so
                    // rapid-save editors (e.g. VS Code auto-save) don't flood the
                    // SFTP thread with consecutive uploads.
                    let debounce = std::time::Duration::from_millis(500);
                    for (remote_path, wf) in watched.iter_mut() {
                        let Ok(meta) = std::fs::metadata(&wf.temp_path) else {
                            continue;
                        };
                        let Ok(mtime) = meta.modified() else { continue };
                        if wf.last_mtime.map_or(true, |prev| mtime > prev) {
                            let ready = wf.last_upload_at.map_or(true, |t| t.elapsed() >= debounce);
                            if ready {
                                // Update mtime only when we actually proceed with the upload so
                                // the next poll still sees the change if we're in the debounce
                                // window and would otherwise permanently drop the save.
                                wf.last_mtime = Some(mtime);
                                wf.last_upload_at = Some(std::time::Instant::now());
                                if upload_file(
                                    &sftp,
                                    &wf.temp_path,
                                    remote_path,
                                    &session_id,
                                    &app_handle,
                                    true,
                                    &cancel_flag,
                                )
                                .is_ok()
                                {
                                    let _ = app_handle.emit(
                                        &format!("sftp:file_synced:{session_id}"),
                                        remote_path.clone(),
                                    );
                                }
                            }
                        }
                    }
                }
                Ok(msg) => handle_message(
                    msg,
                    &sftp,
                    &session_id,
                    &app_handle,
                    &mut watched,
                    &cancel_flag,
                ),
            }
        }

        // Cleanup: remove all temp files for this session, then the now-empty
        // per-session temp directory itself.
        for (_, wf) in watched.drain() {
            let _ = std::fs::remove_file(&wf.temp_path);
        }
        let _ = std::fs::remove_dir(std::env::temp_dir().join("naden").join(&session_id));

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
    cancel_flag: &Arc<AtomicBool>,
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
        SftpMessage::Rename {
            from,
            to,
            overwrite,
            reply,
        } => {
            let result = (|| {
                if !overwrite && sftp.stat(Path::new(&to)).is_ok() {
                    return Err(AppError::AlreadyExists(to.clone()));
                }
                if overwrite {
                    let _ = sftp.unlink(Path::new(&to));
                }
                sftp.rename(Path::new(&from), Path::new(&to), None)
                    .map_err(|e| sftp_err("rename this item", e))
            })();
            let _ = reply.send(result);
        }
        SftpMessage::UploadFile {
            local_path,
            remote_path,
            overwrite,
            reply,
        } => {
            let result = upload_path(
                sftp,
                &local_path,
                &remote_path,
                session_id,
                app_handle,
                overwrite,
                cancel_flag,
            );
            let _ = reply.send(result);
        }
        SftpMessage::DownloadFile {
            remote_path,
            local_path,
            overwrite,
            reply,
        } => {
            let result = download_path(
                sftp,
                &remote_path,
                &local_path,
                session_id,
                app_handle,
                overwrite,
                cancel_flag,
            );
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
            let _ = reply.send(open_edit(
                sftp,
                &path,
                session_id,
                app_handle,
                watched,
                cancel_flag,
            ));
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
        SftpMessage::CopyFile {
            src,
            dest,
            overwrite,
            reply,
        } => {
            let result = (|| {
                if !overwrite && sftp.stat(Path::new(&dest)).is_ok() {
                    return Err(AppError::AlreadyExists(dest.clone()));
                }
                // Preserve symlinks: recreate the link itself rather than copying
                // the file it points at (which could be arbitrarily large).
                if sftp
                    .lstat(Path::new(&src))
                    .is_ok_and(|stat| stat.file_type().is_symlink())
                {
                    let target = sftp
                        .readlink(Path::new(&src))
                        .map_err(|e| sftp_err("read this symlink", e))?;
                    return sftp
                        .symlink(Path::new(&dest), &target)
                        .map_err(|e| sftp_err("create symlink", e));
                }

                // SFTP has no native copy — download to a temp file then re-upload.
                // UUID prefix prevents collisions when two files share the same base name.
                let base = std::path::Path::new(&src).file_name().unwrap_or_default();
                let unique_name = format!(
                    "{}-{}",
                    uuid::Uuid::new_v4().simple(),
                    base.to_string_lossy()
                );
                let tmp = std::env::temp_dir().join("naden-copy").join(unique_name);
                let _ = std::fs::create_dir_all(tmp.parent().unwrap_or(&std::env::temp_dir()));
                let tmp_str = tmp.to_string_lossy().into_owned();
                let result = download_file(
                    sftp,
                    &src,
                    &tmp_str,
                    session_id,
                    app_handle,
                    true,
                    cancel_flag,
                )
                .and_then(|_| {
                    upload_file(
                        sftp,
                        &tmp_str,
                        &dest,
                        session_id,
                        app_handle,
                        true,
                        cancel_flag,
                    )
                });
                let _ = std::fs::remove_file(&tmp);
                result
            })();
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

/// Uploads a local file or, recursively, a local directory tree.
fn upload_path(
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

fn upload_directory(
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

fn upload_file(
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

    if total > MAX_UPLOAD_BYTES {
        return Err(AppError::Io(format!(
            "File too large to upload ({:.1} GB). Maximum is 2 GB.",
            total as f64 / 1_073_741_824.0
        )));
    }

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

fn open_edit(
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
    let ext = Path::new(&filename)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase());
    match &ext {
        Some(e) if !EDIT_ALLOWED_EXTENSIONS.contains(&e.as_str()) => {
            return Err(AppError::Io(
                "File type not supported for editing: use Download instead".into(),
            ));
        }
        _ => {} // None (no extension) is permitted as plain text
    }

    // Build temp dir: <os_tmp>/naden/<session_id>/
    let temp_dir = std::env::temp_dir().join("naden").join(session_id);
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

/// Downloads a remote file or, recursively, a remote directory tree.
fn download_path(
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

fn download_directory(
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

fn download_file(
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
