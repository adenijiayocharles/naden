use crate::commands::local_commands::{check_home_boundary, check_parent_home_boundary};
use crate::commands::ssh_commands::{auth_for_server, build_jump_chain};
use crate::db::queries;
use crate::error::AppError;
use crate::sftp::{DirListing, SftpMessage};
use crate::AppState;

/// Creates a oneshot channel, sends an SftpMessage built by `$msg(reply_tx)`,
/// and awaits the reply. `$msg` must be a closure `|reply_tx| SftpMessage::Variant { ..., reply: reply_tx }`.
macro_rules! sftp_call {
    ($state:expr, $session_id:expr, $msg:expr) => {{
        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
        let msg = $msg(reply_tx);
        $state.sftp_manager.send(&$session_id, msg)?;
        reply_rx
            .await
            .map_err(|_| AppError::Ssh("SFTP session closed".into()))?
    }};
}

#[tauri::command]
pub async fn touch_sftp_file(
    session_id: String,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    sftp_call!(state, session_id, |reply| SftpMessage::TouchFile {
        path,
        reply,
    })
}

#[tauri::command]
pub async fn open_sftp_session(
    server_id: String,
    session_id: String,
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), AppError> {
    let server = queries::get_server_db(&state.db, &server_id).await?;
    let auth = auth_for_server(&server, &state, &app_handle).await?;

    let jump_chain = build_jump_chain(&server, &state, &app_handle).await?;

    let s = &server.server;
    state.sftp_manager.open_session(
        session_id,
        s.hostname.clone(),
        u16::try_from(s.port).unwrap_or(22),
        s.username.clone(),
        auth,
        jump_chain,
        app_handle,
    )
}

#[tauri::command]
pub async fn close_sftp_session(
    session_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    state.sftp_manager.close_session(&session_id);
    Ok(())
}

#[tauri::command]
pub async fn list_sftp_dir(
    session_id: String,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<DirListing, AppError> {
    sftp_call!(state, session_id, |reply| SftpMessage::ListDir {
        path,
        reply,
    })
}

#[tauri::command]
pub async fn mkdir_sftp(
    session_id: String,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    sftp_call!(state, session_id, |reply| SftpMessage::MkDir {
        path,
        reply,
    })
}

#[tauri::command]
pub async fn delete_sftp(
    session_id: String,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    sftp_call!(state, session_id, |reply| SftpMessage::Delete {
        path,
        reply,
    })
}

#[tauri::command]
pub async fn rename_sftp(
    session_id: String,
    from: String,
    to: String,
    overwrite: bool,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    sftp_call!(state, session_id, |reply| SftpMessage::Rename {
        from,
        to,
        overwrite,
        reply,
    })
}

#[tauri::command]
pub async fn upload_sftp_file(
    session_id: String,
    local_path: String,
    remote_path: String,
    overwrite: bool,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    check_home_boundary(&local_path)?;
    sftp_call!(state, session_id, |reply| SftpMessage::UploadFile {
        local_path,
        remote_path,
        overwrite,
        reply,
    })
}

#[tauri::command]
pub async fn download_sftp_file(
    session_id: String,
    remote_path: String,
    local_path: String,
    overwrite: bool,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    check_parent_home_boundary(&local_path)?;
    sftp_call!(state, session_id, |reply| SftpMessage::DownloadFile {
        remote_path,
        local_path,
        overwrite,
        reply,
    })
}

/// Signals the session's in-progress upload/download to abort. The transfer
/// surfaces this as `AppError::Cancelled` once it next checks the flag.
#[tauri::command]
pub fn cancel_sftp_transfer(session_id: String, state: tauri::State<'_, AppState>) {
    state.sftp_manager.cancel_transfer(&session_id);
}

#[tauri::command]
pub async fn chmod_sftp(
    session_id: String,
    path: String,
    mode: u32,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    sftp_call!(state, session_id, |reply| SftpMessage::SetPermissions {
        path,
        mode,
        reply,
    })
}

#[tauri::command]
pub async fn open_sftp_edit(
    session_id: String,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, AppError> {
    sftp_call!(state, session_id, |reply| SftpMessage::OpenEdit {
        path,
        reply,
    })
}

#[tauri::command]
pub async fn close_sftp_edit(
    session_id: String,
    remote_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    sftp_call!(state, session_id, |reply| SftpMessage::CloseEdit {
        remote_path,
        reply,
    })
}

#[tauri::command]
pub async fn copy_sftp_file(
    session_id: String,
    src: String,
    dest: String,
    overwrite: bool,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    sftp_call!(state, session_id, |reply| SftpMessage::CopyFile {
        src,
        dest,
        overwrite,
        reply,
    })
}

/// Transfer files between two different SFTP sessions.
/// Downloads each file from the source session to a local temp file, then
/// uploads to the destination session. Temp files are cleaned up on both
/// success and failure.
#[tauri::command]
pub async fn cross_copy_sftp_file(
    src_session_id: String,
    src_paths: Vec<String>,
    dst_session_id: String,
    dst_dir: String,
    overwrite: bool,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    for src_path in src_paths {
        let filename = std::path::Path::new(&src_path)
            .file_name()
            .ok_or_else(|| AppError::Io(format!("invalid source path: {src_path}")))?
            .to_string_lossy()
            .into_owned();

        let unique = format!("{}-{}", uuid::Uuid::new_v4().simple(), filename);
        let tmp = std::env::temp_dir().join("naden-xcopy").join(&unique);
        let _ = std::fs::create_dir_all(tmp.parent().unwrap_or(&std::env::temp_dir()));
        let tmp_str = tmp.to_string_lossy().into_owned();
        // Reject dst_dir values that could escape via path traversal.
        // split('/') misses encoded separators; Path::components catches all of them.
        if std::path::Path::new(&dst_dir)
            .components()
            .any(|c| c == std::path::Component::ParentDir)
        {
            return Err(AppError::Io(
                "destination directory must not contain '..' components".into(),
            ));
        }
        let dst_path = format!("{}/{}", dst_dir.trim_end_matches('/'), filename);

        let (dl_tx, dl_rx) = tokio::sync::oneshot::channel();
        state.sftp_manager.send(
            &src_session_id,
            SftpMessage::DownloadFile {
                remote_path: src_path,
                local_path: tmp_str.clone(),
                overwrite: true,
                reply: dl_tx,
            },
        )?;
        let dl_result = dl_rx
            .await
            .map_err(|_| AppError::Ssh("SFTP source session closed".into()))?;

        if let Err(e) = dl_result {
            let _ = std::fs::remove_file(&tmp);
            return Err(e);
        }

        let (ul_tx, ul_rx) = tokio::sync::oneshot::channel();
        state.sftp_manager.send(
            &dst_session_id,
            SftpMessage::UploadFile {
                local_path: tmp_str.clone(),
                remote_path: dst_path,
                overwrite,
                reply: ul_tx,
            },
        )?;
        let ul_result = ul_rx
            .await
            .map_err(|_| AppError::Ssh("SFTP destination session closed".into()))?;

        let _ = std::fs::remove_file(&tmp);
        ul_result?;
    }
    Ok(())
}
