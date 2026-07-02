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

/// Creates a unique temp directory for use in a single test.
fn make_tmp_dir() -> std::path::PathBuf {
    let dir = std::env::temp_dir()
        .join("naden_sftp_tests")
        .join(uuid::Uuid::new_v4().simple().to_string());
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

/// Zips the contents of `src` and returns the archive for inspection.
/// Uses a separate temp dir for the output zip file so the zip itself is
/// never included as an entry.
fn zip_dir_contents(src: &std::path::Path) -> zip::ZipArchive<std::fs::File> {
    let out_dir = make_tmp_dir();
    let zip_path = out_dir.join("out.zip");
    let file = std::fs::File::create(&zip_path).unwrap();
    let mut writer = zip::ZipWriter::new(file);
    build_zip(&mut writer, src, src, 0).unwrap();
    writer.finish().unwrap();
    let f = std::fs::File::open(&zip_path).unwrap();
    zip::ZipArchive::new(f).unwrap()
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
    // Dockerfile, Makefile, etc. — no extension means plain text
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

// ── check_upload_size ────────────────────────────────────────────────────────

#[test]
fn check_upload_size_allows_files_under_the_limit() {
    assert!(check_upload_size(1024).is_ok());
}

#[test]
fn check_upload_size_allows_zero_bytes() {
    assert!(check_upload_size(0).is_ok());
}

#[test]
fn check_upload_size_allows_exactly_at_limit() {
    assert!(check_upload_size(MAX_UPLOAD_BYTES).is_ok());
}

#[test]
fn check_upload_size_rejects_files_over_the_limit() {
    assert!(check_upload_size(MAX_UPLOAD_BYTES + 1).is_err());
}

#[test]
fn check_upload_size_rejects_u64_max() {
    assert!(check_upload_size(u64::MAX).is_err());
}

#[test]
fn check_upload_size_error_message_mentions_gb() {
    let err = check_upload_size(MAX_UPLOAD_BYTES + 1).unwrap_err();
    assert!(err.to_string().contains("GB"));
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

// ── sanitize_zip_entry_name ──────────────────────────────────────────────────

#[test]
fn sanitize_zip_entry_name_accepts_simple_filename() {
    assert_eq!(
        sanitize_zip_entry_name("file.txt").unwrap(),
        std::path::PathBuf::from("file.txt")
    );
}

#[test]
fn sanitize_zip_entry_name_accepts_nested_path() {
    assert_eq!(
        sanitize_zip_entry_name("a/b/c.txt").unwrap(),
        std::path::PathBuf::from("a/b/c.txt")
    );
}

#[test]
fn sanitize_zip_entry_name_rejects_double_dot_component() {
    assert!(sanitize_zip_entry_name("../secret.txt").is_err());
}

#[test]
fn sanitize_zip_entry_name_rejects_traversal_in_nested_path() {
    assert!(sanitize_zip_entry_name("a/../../etc/passwd").is_err());
}

#[test]
fn sanitize_zip_entry_name_rejects_windows_style_traversal() {
    // Backslashes are normalised to slashes before splitting, so ..\ is still caught.
    assert!(sanitize_zip_entry_name("..\\..\\windows\\system32").is_err());
}

#[test]
fn sanitize_zip_entry_name_rejects_null_byte() {
    assert!(sanitize_zip_entry_name("file\0.txt").is_err());
}

#[test]
fn sanitize_zip_entry_name_rejects_empty_name() {
    assert!(sanitize_zip_entry_name("").is_err());
}

#[test]
fn sanitize_zip_entry_name_rejects_dot_only() {
    // A single "." reduces to an empty path after filtering.
    assert!(sanitize_zip_entry_name(".").is_err());
}

#[test]
fn sanitize_zip_entry_name_rejects_double_dot_only() {
    assert!(sanitize_zip_entry_name("..").is_err());
}

#[test]
fn sanitize_zip_entry_name_strips_leading_slash_rather_than_rejecting() {
    // Absolute paths in zip entries are made relative — the leading component
    // is an empty string after splitting on '/' and is discarded.
    assert_eq!(
        sanitize_zip_entry_name("/etc/passwd").unwrap(),
        std::path::PathBuf::from("etc/passwd")
    );
}

#[test]
fn sanitize_zip_entry_name_strips_dot_path_components() {
    assert_eq!(
        sanitize_zip_entry_name("a/./b.txt").unwrap(),
        std::path::PathBuf::from("a/b.txt")
    );
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
    SftpManager::new().close_session("ghost");
}

// ── build_zip ────────────────────────────────────────────────────────────────

#[test]
fn build_zip_empty_directory_produces_zero_entries() {
    let src = make_tmp_dir();
    let archive = zip_dir_contents(&src);
    assert_eq!(archive.len(), 0);
    std::fs::remove_dir_all(&src).ok();
}

#[test]
fn build_zip_includes_a_single_file() {
    let src = make_tmp_dir();
    std::fs::write(src.join("hello.txt"), b"world").unwrap();
    let mut archive = zip_dir_contents(&src);
    assert_eq!(archive.len(), 1);
    let mut f = archive.by_index(0).unwrap();
    let mut content = String::new();
    f.read_to_string(&mut content).unwrap();
    assert_eq!(content, "world");
    std::fs::remove_dir_all(&src).ok();
}

#[test]
fn build_zip_includes_file_in_subdirectory() {
    let src = make_tmp_dir();
    std::fs::create_dir(src.join("sub")).unwrap();
    std::fs::write(src.join("sub").join("nested.txt"), b"deep").unwrap();
    let mut archive = zip_dir_contents(&src);
    // ZipArchive::by_name looks up by the stored entry path.
    assert!(archive.by_name("sub/nested.txt").is_ok());
    std::fs::remove_dir_all(&src).ok();
}

#[test]
fn build_zip_preserves_file_content_in_subdirectory() {
    let src = make_tmp_dir();
    std::fs::create_dir(src.join("sub")).unwrap();
    std::fs::write(src.join("sub").join("data.txt"), b"payload").unwrap();
    let mut archive = zip_dir_contents(&src);
    let mut entry = archive.by_name("sub/data.txt").unwrap();
    let mut content = String::new();
    entry.read_to_string(&mut content).unwrap();
    assert_eq!(content, "payload");
    std::fs::remove_dir_all(&src).ok();
}

#[test]
fn build_zip_includes_multiple_files() {
    let src = make_tmp_dir();
    std::fs::write(src.join("a.txt"), b"a").unwrap();
    std::fs::write(src.join("b.txt"), b"b").unwrap();
    let archive = zip_dir_contents(&src);
    assert_eq!(archive.len(), 2);
    std::fs::remove_dir_all(&src).ok();
}

// ── extract_zip_to_dir: zip bomb guards ──────────────────────────────────────

/// Builds a zip at `zip_path` containing `n` empty stored entries named "0.txt", "1.txt", …
fn make_zip_with_n_entries(zip_path: &std::path::Path, n: usize) {
    let file = std::fs::File::create(zip_path).unwrap();
    let mut writer = zip::ZipWriter::new(file);
    let opts = zip::write::FileOptions::default();
    for i in 0..n {
        writer.start_file(format!("{i}.txt"), opts).unwrap();
    }
    writer.finish().unwrap();
}

#[test]
fn extract_zip_rejects_archive_exceeding_entry_limit() {
    let dir = make_tmp_dir();
    let zip_path = dir.join("bomb.zip");
    make_zip_with_n_entries(&zip_path, MAX_ZIP_ENTRIES + 1);
    let extract_dir = make_tmp_dir();
    let result = extract_zip_to_dir(
        &zip_path,
        &extract_dir,
        MAX_ZIP_ENTRIES,
        MAX_ZIP_UNCOMPRESSED,
    );
    assert!(result.is_err());
    std::fs::remove_dir_all(&dir).ok();
    std::fs::remove_dir_all(&extract_dir).ok();
}

#[test]
fn extract_zip_rejects_archive_exceeding_uncompressed_size_limit() {
    let dir = make_tmp_dir();
    let zip_path = dir.join("bomb.zip");
    {
        let file = std::fs::File::create(&zip_path).unwrap();
        let mut writer = zip::ZipWriter::new(file);
        let opts = zip::write::FileOptions::default();
        writer.start_file("data.txt", opts).unwrap();
        writer.write_all(b"hello world").unwrap(); // 11 bytes
        writer.finish().unwrap();
    }
    let extract_dir = make_tmp_dir();
    // Limit to 10 bytes — the 11-byte entry must trip the size guard.
    let result = extract_zip_to_dir(&zip_path, &extract_dir, MAX_ZIP_ENTRIES, 10);
    assert!(result.is_err());
    std::fs::remove_dir_all(&dir).ok();
    std::fs::remove_dir_all(&extract_dir).ok();
}
