// Self-registers a `sshelter` symlink in ~/.local/bin so the app can be
// launched from a terminal (`sshelter`), regardless of where it was installed.
// Runs once per launch as a cheap idempotent check — no admin privileges
// needed since ~/.local/bin is user-writable.

use std::io;
use std::os::unix::fs::symlink;
use std::path::{Path, PathBuf};

const LINK_NAME: &str = "sshelter";
const RC_CANDIDATES: &[&str] = &[".zshrc", ".zprofile", ".bash_profile", ".profile"];

pub fn ensure_installed() {
    if let Err(e) = try_install() {
        log::warn!("[cli_install] failed to register `sshelter` command: {e}");
    }
}

fn try_install() -> io::Result<()> {
    let exe = std::env::current_exe()?.canonicalize()?;
    let home = home_dir()?;
    let bin_dir = home.join(".local").join("bin");
    std::fs::create_dir_all(&bin_dir)?;

    let link = bin_dir.join(LINK_NAME);
    let points_to_exe = std::fs::read_link(&link).map(|t| t == exe).unwrap_or(false);
    if !points_to_exe {
        let _ = std::fs::remove_file(&link);
        symlink(&exe, &link)?;
    }

    ensure_path_export(&home, &bin_dir);
    Ok(())
}

fn home_dir() -> io::Result<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "HOME is not set"))
}

/// Appends a PATH export to the user's shell profile if `bin_dir` isn't
/// already referenced by any of their rc files.
fn ensure_path_export(home: &Path, bin_dir: &Path) {
    let bin_dir_str = bin_dir.to_string_lossy();
    let already_referenced = RC_CANDIDATES.iter().any(|name| {
        std::fs::read_to_string(home.join(name))
            .map(|contents| contents.contains(bin_dir_str.as_ref()))
            .unwrap_or(false)
    });
    if already_referenced {
        return;
    }

    let shell = std::env::var("SHELL").unwrap_or_default();
    let rc_name = if shell.contains("zsh") {
        ".zprofile"
    } else {
        ".bash_profile"
    };
    let line = format!(
        "\n# Added by SSHelter so the `sshelter` command is available in your terminal\nexport PATH=\"{bin_dir_str}:$PATH\"\n"
    );

    use std::io::Write;
    match std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(home.join(rc_name))
    {
        Ok(mut f) => {
            if let Err(e) = f.write_all(line.as_bytes()) {
                log::warn!("[cli_install] failed to update {rc_name}: {e}");
            }
        }
        Err(e) => log::warn!("[cli_install] failed to open {rc_name}: {e}"),
    }
}
