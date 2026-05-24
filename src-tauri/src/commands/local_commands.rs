use std::os::unix::fs::PermissionsExt;

use crate::error::AppError;

fn home_boundary() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
    std::fs::canonicalize(&home).unwrap_or_else(|_| std::path::PathBuf::from(home))
}

/// Canonicalizes `path` and verifies it is under the home directory.
/// Use for paths that must already exist.
fn check_home_boundary(path: &str) -> Result<std::path::PathBuf, AppError> {
    let canonical = std::fs::canonicalize(path).map_err(|e| AppError::Io(e.to_string()))?;
    if !canonical.starts_with(home_boundary()) {
        return Err(AppError::Io(format!(
            "Path is outside home directory: {path}"
        )));
    }
    Ok(canonical)
}

/// Canonicalizes the parent of `path` and verifies it is under the home directory.
/// Use for paths that do not exist yet (create/rename target).
fn check_parent_home_boundary(path: &str) -> Result<(), AppError> {
    let p = std::path::Path::new(path);
    let parent = p
        .parent()
        .ok_or_else(|| AppError::Io(format!("Invalid path: {path}")))?;
    let canonical_parent =
        std::fs::canonicalize(parent).map_err(|e| AppError::Io(e.to_string()))?;
    if !canonical_parent.starts_with(home_boundary()) {
        return Err(AppError::Io(format!(
            "Path is outside home directory: {path}"
        )));
    }
    Ok(())
}

#[tauri::command]
pub fn create_local_dir(path: String) -> Result<(), AppError> {
    check_parent_home_boundary(&path)?;
    std::fs::create_dir(&path).map_err(|e| AppError::Io(e.to_string()))
}

#[tauri::command]
pub fn create_local_file(path: String) -> Result<(), AppError> {
    check_parent_home_boundary(&path)?;
    std::fs::File::create(&path)
        .map(|_| ())
        .map_err(|e| AppError::Io(e.to_string()))
}

#[tauri::command]
pub fn rename_local(from: String, to: String) -> Result<(), AppError> {
    check_home_boundary(&from)?;
    check_parent_home_boundary(&to)?;
    std::fs::rename(&from, &to).map_err(|e| AppError::Io(format!("Cannot rename: {e}")))
}

#[tauri::command]
pub fn delete_local(path: String) -> Result<(), AppError> {
    let canonical = check_home_boundary(&path)?;
    if canonical.is_dir() {
        std::fs::remove_dir_all(&canonical).map_err(|e| AppError::Io(e.to_string()))
    } else {
        std::fs::remove_file(&canonical).map_err(|e| AppError::Io(e.to_string()))
    }
}

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), AppError> {
    check_home_boundary(&path)?;
    std::process::Command::new("open")
        .args(["-R", &path])
        .spawn()
        .map(|_| ())
        .map_err(|e| AppError::Io(format!("Cannot reveal in Finder: {e}")))
}

#[tauri::command]
pub fn open_local(path: String) -> Result<(), AppError> {
    check_home_boundary(&path)?;
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map(|_| ())
        .map_err(|e| AppError::Io(format!("Cannot open: {e}")))
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<i64>,
    pub permissions: u32,
}

#[tauri::command]
pub fn get_local_home_dir() -> String {
    std::env::var("HOME").unwrap_or_else(|_| "/".to_string())
}

#[tauri::command]
pub fn list_local_dir(path: String) -> Result<Vec<LocalFileEntry>, AppError> {
    check_home_boundary(&path)?;
    let mut entries: Vec<LocalFileEntry> = std::fs::read_dir(&path)
        .map_err(|e| AppError::Io(format!("Cannot read {path}: {e}")))?
        .filter_map(|res| res.ok())
        .filter_map(|entry| {
            let meta = entry.metadata().ok()?;
            let name = entry.file_name().to_string_lossy().into_owned();
            // Skip hidden files that start with . — caller can opt in later
            let path = entry.path().to_string_lossy().into_owned();
            let is_dir = meta.is_dir();
            let size = if is_dir { 0 } else { meta.len() };
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64);
            let permissions = meta.permissions().mode();
            Some(LocalFileEntry {
                name,
                path,
                is_dir,
                size,
                modified,
                permissions,
            })
        })
        .collect();

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}
