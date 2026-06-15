use super::*;

fn fresh_known_hosts() -> ssh2::KnownHosts {
    ssh2::Session::new().unwrap().known_hosts().unwrap()
}

// Real, publicly-published ed25519 host keys (github.com / bitbucket.org) —
// used so ssh2's known_hosts parser accepts and counts the entries.
const HOST_KEY_1: &str =
    "first.example ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl\n";
const HOST_KEY_2: &str =
    "second.example ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIazEu89wgQZ4bqs3d63QSMzYVa0MuJ2e2gKTKqu+UUO\n";

/// Covers the cache's read/serve/invalidate behavior in a single test —
/// the cache is a process-wide static, so separate tests touching it
/// would race under cargo's parallel test runner.
#[test]
fn known_hosts_cache_reads_serves_and_invalidates() {
    invalidate_known_hosts_cache();
    let path =
        std::env::temp_dir().join(format!("naden_known_hosts_test_{}", uuid::Uuid::new_v4()));
    let cleanup = || {
        let _ = std::fs::remove_file(&path);
    };

    std::fs::write(&path, HOST_KEY_1).unwrap();

    // First read goes to disk and populates the cache.
    let mut first = fresh_known_hosts();
    load_known_hosts_cached(&mut first, &path);
    assert_eq!(first.hosts().unwrap().len(), 1);
    assert!(recover_lock(KNOWN_HOSTS_CACHE.lock()).is_some());

    // Overwrite with different content but restore the original mtime — a
    // cache hit (mtime unchanged) must serve the originally-read content
    // rather than re-parsing the file.
    let mtime = std::fs::metadata(&path).unwrap().modified().unwrap();
    std::fs::write(&path, format!("{HOST_KEY_1}{HOST_KEY_2}")).unwrap();
    std::fs::File::open(&path)
        .unwrap()
        .set_modified(mtime)
        .unwrap();

    let mut cached = fresh_known_hosts();
    load_known_hosts_cached(&mut cached, &path);
    assert_eq!(cached.hosts().unwrap().len(), 1);

    // After invalidation, the on-disk content (now 2 entries) is picked up.
    invalidate_known_hosts_cache();
    let mut refreshed = fresh_known_hosts();
    load_known_hosts_cached(&mut refreshed, &path);
    assert_eq!(refreshed.hosts().unwrap().len(), 2);

    cleanup();
    invalidate_known_hosts_cache();
}
