use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};

use base64::Engine as _;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::Emitter;

use crate::error::AppError;
use crate::ssh::connection::{recover_lock, ActiveSession, SessionMessage};

/// How long the input/resize loop waits on the channel before checking whether
/// the shell process exited on its own (e.g. the user typed `exit`).
const CHILD_POLL_MS: u64 = 200;

/// Runs a local shell inside a PTY, mirroring the `terminal:*:{session_id}` event
/// contract that `run_session` (the SSH path) uses, so the frontend doesn't need
/// to distinguish session kinds.
pub fn run_local_session(
    session_id: String,
    initial_dir: Option<String>,
    rx: Receiver<SessionMessage>,
    app_handle: tauri::AppHandle,
    sessions: Arc<Mutex<HashMap<String, ActiveSession>>>,
) {
    let output_event = format!("terminal:output:{session_id}");
    let closed_event = format!("terminal:closed:{session_id}");

    let _ = app_handle.emit(&format!("terminal:status:{session_id}"), "connecting");

    let result: Result<(), AppError> = (|| {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::Io(format!("Failed to allocate local PTY: {e}")))?;

        let mut cmd = CommandBuilder::new_default_prog();
        cmd.env("TERM", "xterm-256color");
        if let Some(dir) = &initial_dir {
            cmd.cwd(dir);
        }

        let mut child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| AppError::Io(format!("Failed to start local shell: {e}")))?;
        // Drop the parent's copy of the slave end so the master's reader sees EOF
        // once the child exits, instead of blocking on a handle we still hold open.
        drop(pair.slave);

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::Io(format!("Failed to read from local PTY: {e}")))?;
        let mut writer = pair
            .master
            .take_writer()
            .map_err(|e| AppError::Io(format!("Failed to write to local PTY: {e}")))?;

        let _ = app_handle.emit(&format!("terminal:status:{session_id}"), "connected");

        // portable-pty's reader has no cross-platform non-blocking or timeout mode,
        // so it runs on its own thread; output is forwarded the instant it arrives.
        let app_handle_reader = app_handle.clone();
        let output_event_reader = output_event.clone();
        let reader_thread = std::thread::spawn(move || {
            let mut buf = [0u8; 32768];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let encoded = base64::engine::general_purpose::STANDARD.encode(&buf[..n]);
                        let _ = app_handle_reader.emit(&output_event_reader, encoded);
                    }
                }
            }
        });

        loop {
            match rx.recv_timeout(std::time::Duration::from_millis(CHILD_POLL_MS)) {
                Ok(SessionMessage::Input(data)) => {
                    if writer.write_all(&data).is_err() {
                        break;
                    }
                }
                Ok(SessionMessage::Resize(cols, rows)) => {
                    let _ = pair.master.resize(PtySize {
                        rows,
                        cols,
                        pixel_width: 0,
                        pixel_height: 0,
                    });
                }
                Ok(SessionMessage::Close) => break,
                Err(RecvTimeoutError::Disconnected) => break,
                Err(RecvTimeoutError::Timeout) => {
                    if matches!(child.try_wait(), Ok(Some(_))) {
                        break;
                    }
                }
            }
        }

        let _ = child.kill();
        let _ = child.wait();
        let _ = reader_thread.join();

        Ok(())
    })();

    recover_lock(sessions.lock()).remove(&session_id);

    if let Err(e) = &result {
        let _ = app_handle.emit(&format!("terminal:error:{session_id}"), e.to_string());
    }
    // Payload: true = clean exit (user typed `exit`), false = unexpected failure.
    let _ = app_handle.emit(&closed_event, result.is_ok());
}
