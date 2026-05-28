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

    let jump_chain = build_jump_chain(&state.db, &server, &state, &app_handle).await?;

    let s = &server.server;
    state.sftp_manager.open_session(
        session_id,
        s.hostname.clone(),
        s.port as u16,
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
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    sftp_call!(state, session_id, |reply| SftpMessage::Rename {
        from,
        to,
        reply,
    })
}

#[tauri::command]
pub async fn upload_sftp_file(
    session_id: String,
    local_path: String,
    remote_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    check_home_boundary(&local_path)?;
    sftp_call!(state, session_id, |reply| SftpMessage::UploadFile {
        local_path,
        remote_path,
        reply,
    })
}

#[tauri::command]
pub async fn download_sftp_file(
    session_id: String,
    remote_path: String,
    local_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    check_parent_home_boundary(&local_path)?;
    sftp_call!(state, session_id, |reply| SftpMessage::DownloadFile {
        remote_path,
        local_path,
        reply,
    })
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
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    sftp_call!(state, session_id, |reply| SftpMessage::CopyFile {
        src,
        dest,
        reply,
    })
}
