use std::os::unix::fs::PermissionsExt;

use crate::error::AppError;

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
