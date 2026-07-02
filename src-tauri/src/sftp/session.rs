use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::Emitter;

use crate::error::AppError;
use crate::ssh::connection::{authenticate_session, recover_lock, tcp_connect, AuthInfo};
use crate::ssh::jump_host::{self, JumpInfo};
use crate::ssh::known_hosts::{verify_host_key_interactive, HostKeyConfirmations};

use super::archive::{download_as_zip_impl, unzip_here_impl};
use super::live_edit::{open_edit, WatchedFile};
use super::transfer::{download_file, download_path, upload_file, upload_path};
use super::{delete_entry, list_dir, sftp_err, SftpMessage};

pub(super) struct SftpSessionHandle {
    tx: std::sync::mpsc::SyncSender<SftpMessage>,
    cancel_flag: Arc<AtomicBool>,
}

pub struct SftpManager {
    pub(super) sessions: Arc<Mutex<HashMap<String, SftpSessionHandle>>>,
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
        confirmations: HostKeyConfirmations,
    ) -> Result<(), AppError> {
        let (tx, rx) = std::sync::mpsc::sync_channel(64);
        let cancel_flag = Arc::new(AtomicBool::new(false));

        recover_lock(self.sessions.lock()).insert(
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
                confirmations,
            );
        });

        Ok(())
    }

    /// Signals the session's in-progress transfer (if any) to abort. The
    /// flag is reset at the start of each transfer, so this has no effect
    /// when no transfer is running.
    pub fn cancel_transfer(&self, session_id: &str) {
        if let Some(handle) = recover_lock(self.sessions.lock()).get(session_id) {
            handle.cancel_flag.store(true, Ordering::Relaxed);
        }
    }

    pub(crate) fn send(&self, session_id: &str, msg: SftpMessage) -> Result<(), AppError> {
        // Clone the sender before releasing the lock so we don't hold the mutex
        // during send(), which blocks when the 64-slot channel is full.
        let tx = {
            let sessions = recover_lock(self.sessions.lock());
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
        if let Some(handle) = recover_lock(self.sessions.lock()).get(session_id) {
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
        recover_lock(self.sessions.lock()).remove(self.id);
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
    confirmations: HostKeyConfirmations,
) {
    // Guarantees removal from the sessions map on exit, including panics.
    let _guard = SessionGuard {
        sessions: &sessions,
        id: &session_id,
    };

    let _ = app_handle.emit(&format!("sftp:status:{session_id}"), "connecting");

    let result: Result<(), AppError> = (|| {
        let stream = if jump_chain.is_empty() {
            tcp_connect(&host, port)?
        } else {
            jump_host::open_tunnel(jump_chain, &host, port)?
        };

        let mut session = ssh2::Session::new()
            .map_err(|e| AppError::Ssh(format!("SSH session create failed: {e}")))?;
        session.set_tcp_stream(stream);
        session
            .handshake()
            .map_err(|e| AppError::Ssh(format!("SSH handshake failed: {e}")))?;

        verify_host_key_interactive(
            &session,
            &host,
            port,
            &session_id,
            &app_handle,
            &confirmations,
        )?;
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
                let base = Path::new(&src).file_name().unwrap_or_default();
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
        SftpMessage::DownloadAsZip {
            remote_paths,
            local_path,
            reply,
        } => {
            let _ = reply.send(download_as_zip_impl(
                sftp,
                remote_paths,
                &local_path,
                session_id,
                app_handle,
                cancel_flag,
            ));
        }
        SftpMessage::UnzipHere {
            remote_zip_path,
            remote_dir,
            reply,
        } => {
            let _ = reply.send(unzip_here_impl(
                sftp,
                &remote_zip_path,
                &remote_dir,
                session_id,
                app_handle,
                cancel_flag,
            ));
        }
        SftpMessage::Close => {}
    }
}
