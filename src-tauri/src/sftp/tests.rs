use super::*;

// ── helpers ──────────────────────────────────────────────────────────────────

fn entry(name: &str, is_dir: bool) -> FileEntry {
    FileEntry {
        name: name.to_string(),
        path: format!("/{name}"),
        is_dir,
        is_symlink: false,
        size: 0,
        modified: None,
        permissions: None,
    }
}

fn make_tmp_dir() -> std::path::PathBuf {
    let dir = std::env::temp_dir()
        .join("naden_sftp_tests")
        .join(uuid::Uuid::new_v4().simple().to_string());
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

// ── is_edit_allowed: accepted types ──────────────────────────────────────────

#[test]
fn is_edit_allowed_accepts_known_extension() {
    assert!(is_edit_allowed("notes.txt"));
}

#[test]
fn is_edit_allowed_is_case_insensitive() {
    assert!(is_edit_allowed("README.MD"));
}

#[test]
fn is_edit_allowed_accepts_extensionless_files() {
    assert!(is_edit_allowed("Dockerfile"));
}

#[test]
fn is_edit_allowed_accepts_makefile() {
    assert!(is_edit_allowed("Makefile"));
}

#[test]
fn is_edit_allowed_accepts_dotfiles_as_no_extension() {
    // Rust's Path API treats ".gitconfig" as stem=".gitconfig", no extension
    assert!(is_edit_allowed(".gitconfig"));
}

#[test]
fn is_edit_allowed_accepts_json() {
    assert!(is_edit_allowed("config.json"));
}

#[test]
fn is_edit_allowed_accepts_yaml() {
    assert!(is_edit_allowed("deploy.yaml"));
}

#[test]
fn is_edit_allowed_accepts_rust_source() {
    assert!(is_edit_allowed("main.rs"));
}

#[test]
fn is_edit_allowed_accepts_toml() {
    assert!(is_edit_allowed("Cargo.toml"));
}

#[test]
fn is_edit_allowed_accepts_env() {
    assert!(is_edit_allowed(".env"));
}

// ── is_edit_allowed: rejected types ──────────────────────────────────────────

#[test]
fn is_edit_allowed_rejects_shell_script() {
    assert!(!is_edit_allowed("deploy.sh"));
}

#[test]
fn is_edit_allowed_rejects_bash_script() {
    assert!(!is_edit_allowed("setup.bash"));
}

#[test]
fn is_edit_allowed_rejects_python_script() {
    assert!(!is_edit_allowed("script.py"));
}

#[test]
fn is_edit_allowed_rejects_ruby_script() {
    assert!(!is_edit_allowed("app.rb"));
}

#[test]
fn is_edit_allowed_rejects_perl_script() {
    assert!(!is_edit_allowed("script.pl"));
}

#[test]
fn is_edit_allowed_rejects_powershell() {
    assert!(!is_edit_allowed("run.ps1"));
}

#[test]
fn is_edit_allowed_rejects_executable_binary() {
    assert!(!is_edit_allowed("app.exe"));
}

#[test]
fn is_edit_allowed_rejects_raw_binary() {
    assert!(!is_edit_allowed("firmware.bin"));
}

// ── sort_entries ─────────────────────────────────────────────────────────────

#[test]
fn sort_entries_puts_directories_before_files() {
    let mut entries = vec![entry("zeta.txt", false), entry("alpha", true)];
    sort_entries(&mut entries);
    assert_eq!(entries[0].name, "alpha");
}

#[test]
fn sort_entries_is_case_insensitive_within_files() {
    let mut entries = vec![entry("Banana.txt", false), entry("apple.txt", false)];
    sort_entries(&mut entries);
    assert_eq!(entries[0].name, "apple.txt");
}

#[test]
fn sort_entries_is_case_insensitive_within_dirs() {
    let mut entries = vec![entry("Zebra", true), entry("alpha", true)];
    sort_entries(&mut entries);
    assert_eq!(entries[0].name, "alpha");
}

#[test]
fn sort_entries_empty_list_stays_empty() {
    let mut entries: Vec<FileEntry> = vec![];
    sort_entries(&mut entries);
    assert!(entries.is_empty());
}

#[test]
fn sort_entries_single_entry_is_unchanged() {
    let mut entries = vec![entry("solo.txt", false)];
    sort_entries(&mut entries);
    assert_eq!(entries[0].name, "solo.txt");
}

#[test]
fn sort_entries_first_slot_is_always_a_dir_when_mixed() {
    let mut entries = vec![
        entry("z.txt", false),
        entry("a", true),
        entry("b.txt", false),
    ];
    sort_entries(&mut entries);
    assert!(entries[0].is_dir);
}

#[test]
fn sort_entries_last_slot_is_always_a_file_when_mixed() {
    let mut entries = vec![
        entry("z.txt", false),
        entry("a", true),
        entry("b.txt", false),
    ];
    sort_entries(&mut entries);
    assert!(!entries[entries.len() - 1].is_dir);
}

#[test]
fn sort_entries_dirs_ordered_alphabetically() {
    let mut entries = vec![entry("z", true), entry("a", true), entry("m", true)];
    sort_entries(&mut entries);
    assert_eq!(
        entries.iter().map(|e| e.name.as_str()).collect::<Vec<_>>(),
        ["a", "m", "z"]
    );
}

#[test]
fn sort_entries_files_ordered_alphabetically() {
    let mut entries = vec![
        entry("z.txt", false),
        entry("a.txt", false),
        entry("m.txt", false),
    ];
    sort_entries(&mut entries);
    assert_eq!(
        entries.iter().map(|e| e.name.as_str()).collect::<Vec<_>>(),
        ["a.txt", "m.txt", "z.txt"]
    );
}

// ── sftp_err ─────────────────────────────────────────────────────────────────

#[test]
fn sftp_err_maps_permission_denied_code() {
    let e = ssh2::Error::new(ssh2::ErrorCode::SFTP(3), "denied");
    let err = sftp_err("delete this file", e);
    assert!(matches!(err, AppError::Ssh(msg) if msg.contains("Permission denied")));
}

#[test]
fn sftp_err_permission_denied_message_names_the_action() {
    let e = ssh2::Error::new(ssh2::ErrorCode::SFTP(3), "denied");
    let err = sftp_err("delete this file", e);
    assert!(matches!(err, AppError::Ssh(msg) if msg.contains("delete this file")));
}

#[test]
fn sftp_err_maps_no_such_file_code() {
    let e = ssh2::Error::new(ssh2::ErrorCode::SFTP(2), "missing");
    let err = sftp_err("read this file", e);
    assert!(matches!(err, AppError::Ssh(msg) if msg == "No such file or directory"));
}

#[test]
fn sftp_err_unknown_code_includes_action() {
    let e = ssh2::Error::new(ssh2::ErrorCode::SFTP(1), "failure");
    let err = sftp_err("rename this item", e);
    assert!(matches!(err, AppError::Ssh(msg) if msg.contains("rename this item")));
}

// ── SftpManager ──────────────────────────────────────────────────────────────

#[test]
fn sftp_manager_new_starts_with_no_sessions() {
    let mgr = SftpManager::new();
    assert!(mgr.sessions.lock().unwrap().is_empty());
}

#[test]
fn sftp_manager_send_to_unknown_session_returns_err() {
    let mgr = SftpManager::new();
    let result = mgr.send("ghost", SftpMessage::Close);
    assert!(result.is_err());
}

#[test]
fn sftp_manager_send_error_message_identifies_session() {
    let mgr = SftpManager::new();
    let err = mgr.send("ghost-id", SftpMessage::Close).unwrap_err();
    assert!(err.to_string().contains("ghost-id"));
}

#[test]
fn sftp_manager_cancel_transfer_on_unknown_session_does_not_panic() {
    SftpManager::new().cancel_transfer("ghost");
}

#[test]
fn sftp_manager_close_session_on_unknown_session_does_not_panic() {
    let _ = make_tmp_dir(); // ensure temp dir creation works in this env
    SftpManager::new().close_session("ghost");
}
