use tauri::Emitter;

/// Spawns a background thread that detects system wake from sleep and emits
/// `system:wake` to the frontend within ~5 s of the machine resuming.
///
/// The detection relies on a property of the two standard clocks:
///   - `SystemTime` (wall clock) advances while the machine is asleep.
///   - `Instant`    (monotonic)  is paused while the machine is asleep.
///
/// If the wall clock advanced significantly more than the monotonic clock
/// during a fixed sleep interval, the machine must have been suspended.
pub fn start_sleep_watcher(app_handle: tauri::AppHandle) {
    std::thread::Builder::new()
        .name("sleep-watcher".into())
        .spawn(move || {
            const POLL: std::time::Duration = std::time::Duration::from_secs(5);
            // Require the wall/mono gap to be > 2× POLL to avoid false positives
            // from OS scheduling jitter under heavy load.
            const THRESHOLD: std::time::Duration = std::time::Duration::from_secs(10);

            loop {
                let wall = std::time::SystemTime::now();
                let mono = std::time::Instant::now();

                std::thread::sleep(POLL);

                let wall_elapsed = wall.elapsed().unwrap_or(POLL);
                let mono_elapsed = mono.elapsed();

                if wall_elapsed.saturating_sub(mono_elapsed) > THRESHOLD {
                    let _ = app_handle.emit("system:wake", ());
                }
            }
        })
        .expect("failed to spawn sleep-watcher thread");
}
