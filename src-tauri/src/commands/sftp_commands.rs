use crate::db::queries;
use crate::error::AppError;
use crate::sftp::{DirListing, SftpMessage};
use crate::ssh::jump_host::JumpInfo;
use crate::AppState;
use crate::commands::ssh_commands::{auth_for_server, resolve_jump_chain};


#[tauri::command]
pub async fn touch_sftp_file(
    session_id: String,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state.sftp_manager.send(
        &session_id,
        SftpMessage::TouchFile { path, reply: reply_tx },
    )?;
    reply_rx
        .await
        .map_err(|_| AppError::Ssh("SFTP session closed".into()))?
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

    let hop_servers = resolve_jump_chain(&state.db, &server).await?;
    let mut jump_chain: Vec<JumpInfo> = Vec::with_capacity(hop_servers.len());
    for hop in &hop_servers {
        let hop_auth = auth_for_server(hop, &state, &app_handle).await?;
        jump_chain.push(JumpInfo {
            host: hop.server.hostname.clone(),
            port: hop.server.port as u16,
            username: hop.server.username.clone(),
            auth: hop_auth,
        });
    }

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
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state.sftp_manager.send(
        &session_id,
        SftpMessage::ListDir { path, reply: reply_tx },
    )?;
    reply_rx
        .await
        .map_err(|_| AppError::Ssh("SFTP session closed".into()))?
}

#[tauri::command]
pub async fn mkdir_sftp(
    session_id: String,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state.sftp_manager.send(
        &session_id,
        SftpMessage::MkDir { path, reply: reply_tx },
    )?;
    reply_rx
        .await
        .map_err(|_| AppError::Ssh("SFTP session closed".into()))?
}

#[tauri::command]
pub async fn delete_sftp(
    session_id: String,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state.sftp_manager.send(
        &session_id,
        SftpMessage::Delete { path, reply: reply_tx },
    )?;
    reply_rx
        .await
        .map_err(|_| AppError::Ssh("SFTP session closed".into()))?
}

#[tauri::command]
pub async fn rename_sftp(
    session_id: String,
    from: String,
    to: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state.sftp_manager.send(
        &session_id,
        SftpMessage::Rename { from, to, reply: reply_tx },
    )?;
    reply_rx
        .await
        .map_err(|_| AppError::Ssh("SFTP session closed".into()))?
}

#[tauri::command]
pub async fn upload_sftp_file(
    session_id: String,
    local_path: String,
    remote_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state.sftp_manager.send(
        &session_id,
        SftpMessage::UploadFile { local_path, remote_path, reply: reply_tx },
    )?;
    reply_rx
        .await
        .map_err(|_| AppError::Ssh("SFTP session closed".into()))?
}

#[tauri::command]
pub async fn download_sftp_file(
    session_id: String,
    remote_path: String,
    local_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state.sftp_manager.send(
        &session_id,
        SftpMessage::DownloadFile { remote_path, local_path, reply: reply_tx },
    )?;
    reply_rx
        .await
        .map_err(|_| AppError::Ssh("SFTP session closed".into()))?
}

#[tauri::command]
pub async fn chmod_sftp(
    session_id: String,
    path: String,
    mode: u32,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state.sftp_manager.send(
        &session_id,
        SftpMessage::SetPermissions { path, mode, reply: reply_tx },
    )?;
    reply_rx
        .await
        .map_err(|_| AppError::Ssh("SFTP session closed".into()))?
}

#[tauri::command]
pub async fn open_sftp_edit(
    session_id: String,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, AppError> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state.sftp_manager.send(
        &session_id,
        SftpMessage::OpenEdit { path, reply: reply_tx },
    )?;
    reply_rx
        .await
        .map_err(|_| AppError::Ssh("SFTP session closed".into()))?
}

#[tauri::command]
pub async fn close_sftp_edit(
    session_id: String,
    remote_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state.sftp_manager.send(
        &session_id,
        SftpMessage::CloseEdit { remote_path, reply: reply_tx },
    )?;
    reply_rx
        .await
        .map_err(|_| AppError::Ssh("SFTP session closed".into()))?
}

#[tauri::command]
pub async fn sync_sftp_folder(
    session_id: String,
    local_path: String,
    remote_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<u32, AppError> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state.sftp_manager.send(
        &session_id,
        SftpMessage::SyncFolder { local_path, remote_path, reply: reply_tx },
    )?;
    reply_rx
        .await
        .map_err(|_| AppError::Ssh("SFTP session closed".into()))?
}

#[tauri::command]
pub async fn copy_sftp_file(
    session_id: String,
    src: String,
    dest: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state.sftp_manager.send(
        &session_id,
        SftpMessage::CopyFile { src, dest, reply: reply_tx },
    )?;
    reply_rx
        .await
        .map_err(|_| AppError::Ssh("SFTP session closed".into()))?
}
