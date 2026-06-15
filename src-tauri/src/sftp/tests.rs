use super::*;

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
fn is_edit_allowed_rejects_executable_extension() {
    assert!(!is_edit_allowed("deploy.sh"));
}

#[test]
fn sort_entries_puts_directories_before_files() {
    let mut entries = vec![entry("zeta.txt", false), entry("alpha", true)];
    sort_entries(&mut entries);
    assert_eq!(entries[0].name, "alpha");
}

#[test]
fn sort_entries_is_case_insensitive_within_a_group() {
    let mut entries = vec![entry("Banana.txt", false), entry("apple.txt", false)];
    sort_entries(&mut entries);
    assert_eq!(entries[0].name, "apple.txt");
}

#[test]
fn check_upload_size_allows_files_under_the_limit() {
    assert!(check_upload_size(1024).is_ok());
}

#[test]
fn check_upload_size_rejects_files_over_the_limit() {
    assert!(check_upload_size(MAX_UPLOAD_BYTES + 1).is_err());
}

#[test]
fn sftp_err_maps_permission_denied_code() {
    let e = ssh2::Error::new(ssh2::ErrorCode::SFTP(3), "denied");
    let err = sftp_err("delete this file", e);
    assert!(matches!(err, AppError::Ssh(msg) if msg.contains("Permission denied")));
}

#[test]
fn sftp_err_maps_no_such_file_code() {
    let e = ssh2::Error::new(ssh2::ErrorCode::SFTP(2), "missing");
    let err = sftp_err("read this file", e);
    assert!(matches!(err, AppError::Ssh(msg) if msg == "No such file or directory"));
}
