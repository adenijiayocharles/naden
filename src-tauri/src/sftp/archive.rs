use std::io::Read;
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use super::transfer::{download_file, download_path, upload_directory};
use crate::error::AppError;

pub(crate) const MAX_ZIP_ENTRIES: usize = 10_000;
pub(crate) const MAX_ZIP_UNCOMPRESSED: u64 = 2 * 1024 * 1024 * 1024; // 2 GB

/// Validates a zip entry name, rejecting path traversal and invalid characters.
/// Returns a safe relative PathBuf on success.
pub(crate) fn sanitize_zip_entry_name(name: &str) -> Result<std::path::PathBuf, AppError> {
    if name.contains('\0') {
        return Err(AppError::Validation(
            "archive entry name contains invalid characters".into(),
        ));
    }
    let mut safe = std::path::PathBuf::new();
    for component in name.replace('\\', "/").split('/') {
        match component {
            "" | "." => {}
            ".." => {
                return Err(AppError::Validation(
                    "archive contains path traversal components".into(),
                ))
            }
            c => safe.push(c),
        }
    }
    if safe.as_os_str().is_empty() {
        return Err(AppError::Validation("archive entry has empty name".into()));
    }
    Ok(safe)
}

/// Recursively adds the contents of `dir` to `zip`, using paths relative to `base`.
/// `depth` guards against stack overflow from deeply nested remote directories.
pub(crate) fn build_zip(
    zip: &mut zip::ZipWriter<std::fs::File>,
    base: &Path,
    dir: &Path,
    depth: usize,
) -> Result<(), AppError> {
    const MAX_DEPTH: usize = 256;
    if depth > MAX_DEPTH {
        return Err(AppError::Validation(format!(
            "directory nesting too deep (max {MAX_DEPTH} levels)"
        )));
    }
    use zip::write::FileOptions;
    let entries =
        std::fs::read_dir(dir).map_err(|e| AppError::Io(format!("cannot read directory: {e}")))?;
    for entry in entries {
        let entry = entry.map_err(|e| AppError::Io(format!("directory entry error: {e}")))?;
        let path = entry.path();
        let relative = path
            .strip_prefix(base)
            .map_err(|_| AppError::Io("path computation error".into()))?;
        let name = relative.to_string_lossy().replace('\\', "/");
        if path.is_dir() {
            zip.add_directory(format!("{name}/"), FileOptions::default())
                .map_err(|e| AppError::Io(format!("zip error: {e}")))?;
            build_zip(zip, base, &path, depth + 1)?;
        } else {
            let opts = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
            zip.start_file(&name, opts)
                .map_err(|e| AppError::Io(format!("zip error: {e}")))?;
            let mut f = std::fs::File::open(&path)
                .map_err(|e| AppError::Io(format!("cannot open file for zip: {e}")))?;
            std::io::copy(&mut f, zip)
                .map_err(|e| AppError::Io(format!("zip write error: {e}")))?;
        }
    }
    Ok(())
}

/// Validates and extracts a zip archive at `zip_path` into `extract_dir`.
/// Rejects archives that exceed `max_entries` entries or would decompress to
/// more than `max_uncompressed_bytes` total. Both limits are parameterised so
/// callers can pass the production constants and tests can use small values.
pub(crate) fn extract_zip_to_dir(
    zip_path: &std::path::Path,
    extract_dir: &std::path::Path,
    max_entries: usize,
    max_uncompressed_bytes: u64,
) -> Result<(), AppError> {
    let file =
        std::fs::File::open(zip_path).map_err(|e| AppError::Io(format!("cannot open zip: {e}")))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| AppError::Io(format!("cannot read zip archive: {e}")))?;

    if archive.len() > max_entries {
        return Err(AppError::Validation(format!(
            "archive contains too many entries (max {max_entries})"
        )));
    }

    let mut total_extracted: u64 = 0;
    for i in 0..archive.len() {
        let entry = archive
            .by_index(i)
            .map_err(|e| AppError::Io(format!("cannot read zip entry: {e}")))?;

        let sanitized = sanitize_zip_entry_name(entry.name())?;
        let out_path = extract_dir.join(&sanitized);

        // Final guard: verify the resolved path is still within extract_dir.
        if !out_path.starts_with(extract_dir) {
            return Err(AppError::Validation(
                "archive entry would escape extraction directory".into(),
            ));
        }

        if entry.is_dir() {
            std::fs::create_dir_all(&out_path)
                .map_err(|e| AppError::Io(format!("cannot create directory: {e}")))?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| AppError::Io(format!("cannot create parent dir: {e}")))?;
            }
            let mut out_file = std::fs::File::create(&out_path)
                .map_err(|e| AppError::Io(format!("cannot create file: {e}")))?;
            // Budget the read to remaining bytes + 1 so we detect bombs where
            // declared entry.size() is 0 but the inflated stream is enormous.
            let budget = max_uncompressed_bytes
                .saturating_sub(total_extracted)
                .saturating_add(1);
            let written = std::io::copy(&mut entry.take(budget), &mut out_file)
                .map_err(|e| AppError::Io(format!("extraction failed: {e}")))?;
            total_extracted = total_extracted.saturating_add(written);
            if total_extracted > max_uncompressed_bytes {
                return Err(AppError::Validation(format!(
                    "archive would extract to more than {} GB",
                    max_uncompressed_bytes / 1_073_741_824
                )));
            }
        }
    }
    Ok(())
}

/// Downloads each path in `remote_paths` to a temp directory, then creates a
/// zip archive at `local_path`. Cleans up the temp directory on both success
/// and failure.
pub(crate) fn download_as_zip_impl(
    sftp: &ssh2::Sftp,
    remote_paths: Vec<String>,
    local_path: &str,
    session_id: &str,
    app_handle: &tauri::AppHandle,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<(), AppError> {
    let temp_dir = std::env::temp_dir()
        .join("naden-zip")
        .join(uuid::Uuid::new_v4().simple().to_string());
    let _ = std::fs::create_dir_all(&temp_dir);

    let result = (|| {
        for remote_path in &remote_paths {
            let name = Path::new(remote_path)
                .file_name()
                .ok_or_else(|| AppError::Io(format!("invalid remote path: {remote_path}")))?
                .to_string_lossy()
                .into_owned();
            let local_dest = temp_dir.join(&name);
            let local_dest_str = local_dest.to_string_lossy().into_owned();
            download_path(
                sftp,
                remote_path,
                &local_dest_str,
                session_id,
                app_handle,
                true,
                cancel_flag,
            )?;
        }

        let zip_file = std::fs::File::create(local_path)
            .map_err(|e| AppError::Io(format!("cannot create zip file: {e}")))?;
        let mut zip = zip::ZipWriter::new(zip_file);
        build_zip(&mut zip, &temp_dir, &temp_dir, 0)?;
        zip.finish()
            .map_err(|e| AppError::Io(format!("cannot finalize zip: {e}")))?;
        Ok(())
    })();

    // Remove partial zip on failure
    if result.is_err() {
        let _ = std::fs::remove_file(local_path);
    }
    let _ = std::fs::remove_dir_all(&temp_dir);
    result
}

/// Downloads a remote .zip file, extracts it with path-traversal and size
/// guards, then uploads the extracted contents to `remote_dir` via SFTP.
/// Cleans up all temp files on both success and failure.
pub(crate) fn unzip_here_impl(
    sftp: &ssh2::Sftp,
    remote_zip_path: &str,
    remote_dir: &str,
    session_id: &str,
    app_handle: &tauri::AppHandle,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<(), AppError> {
    let temp_base = std::env::temp_dir()
        .join("naden-zip")
        .join(uuid::Uuid::new_v4().simple().to_string());
    let temp_zip = temp_base.join("archive.zip");
    let extract_dir = temp_base.join("extracted");
    let _ = std::fs::create_dir_all(&temp_base);

    let result = (|| {
        let temp_zip_str = temp_zip.to_string_lossy().into_owned();
        download_file(
            sftp,
            remote_zip_path,
            &temp_zip_str,
            session_id,
            app_handle,
            true,
            cancel_flag,
        )?;

        std::fs::create_dir_all(&extract_dir)
            .map_err(|e| AppError::Io(format!("cannot create extract dir: {e}")))?;

        extract_zip_to_dir(
            &temp_zip,
            &extract_dir,
            MAX_ZIP_ENTRIES,
            MAX_ZIP_UNCOMPRESSED,
        )?;

        let extract_str = extract_dir.to_string_lossy().into_owned();
        upload_directory(
            sftp,
            &extract_str,
            remote_dir,
            session_id,
            app_handle,
            true,
            cancel_flag,
        )
    })();

    let _ = std::fs::remove_dir_all(&temp_base);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write as _;

    fn make_tmp_dir() -> std::path::PathBuf {
        let dir = std::env::temp_dir()
            .join("naden_sftp_archive_tests")
            .join(uuid::Uuid::new_v4().simple().to_string());
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

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

    fn make_zip_with_n_entries(zip_path: &std::path::Path, n: usize) {
        let file = std::fs::File::create(zip_path).unwrap();
        let mut writer = zip::ZipWriter::new(file);
        let opts = zip::write::FileOptions::default();
        for i in 0..n {
            writer.start_file(format!("{i}.txt"), opts).unwrap();
        }
        writer.finish().unwrap();
    }

    // ── sanitize_zip_entry_name ───────────────────────────────────────────────

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
        assert!(sanitize_zip_entry_name(".").is_err());
    }

    #[test]
    fn sanitize_zip_entry_name_rejects_double_dot_only() {
        assert!(sanitize_zip_entry_name("..").is_err());
    }

    #[test]
    fn sanitize_zip_entry_name_strips_leading_slash_rather_than_rejecting() {
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

    // ── build_zip ─────────────────────────────────────────────────────────────

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

    // ── extract_zip_to_dir: zip bomb guards ───────────────────────────────────

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
}
