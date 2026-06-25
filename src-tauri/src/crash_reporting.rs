//! Opt-in crash reporting via Sentry. Disabled unless both the user has
//! explicitly enabled it in Settings *and* a DSN was compiled in via the
//! `NADEN_SENTRY_DSN` build-time env var. That var is unset in local/dev
//! builds, so reporting is a silent no-op until a release pipeline supplies
//! a real DSN via a CI secret — mirroring how the updater's signing key is
//! supplied (see `.github/workflows/release.yml`).
//!
//! A Sentry DSN is designed to be safe to embed in client binaries: it only
//! authorizes *submitting* events to one project, not reading any data back.

use sentry::protocol::Event;
use std::sync::Arc;

const SENTRY_DSN: Option<&str> = option_env!("NADEN_SENTRY_DSN");

/// `option_env!` returns `Some("")` when a CI secret is referenced but left
/// unset (GitHub Actions substitutes an empty string, not an absent var),
/// so an empty DSN must be treated the same as no DSN at all.
fn configured_dsn() -> Option<&'static str> {
    non_empty(SENTRY_DSN)
}

fn non_empty(dsn: Option<&str>) -> Option<&str> {
    dsn.filter(|d| !d.is_empty())
}

#[tauri::command]
pub fn crash_reporting_is_available() -> bool {
    configured_dsn().is_some()
}

/// Initializes the Sentry client if `enabled` and a DSN was compiled in.
///
/// Must be called after the local panic hook in `run()` is installed —
/// Sentry's panic integration chains to whatever hook was already set, so
/// the existing local crash log and native alert keep working unchanged
/// regardless of whether this returns `Some`.
///
/// The returned guard must be kept alive (e.g. via `app.manage`) for the
/// rest of the process — dropping it shuts the client down.
pub fn init(enabled: bool) -> Option<sentry::ClientInitGuard> {
    let dsn = configured_dsn().filter(|_| enabled)?;
    Some(sentry::init((
        dsn,
        sentry::ClientOptions {
            release: sentry::release_name!(),
            send_default_pii: false,
            // `send_default_pii: false` does NOT stop the `contexts`
            // integration from filling this with the real machine hostname
            // (often the device owner's name on macOS) — it only checks
            // whether the field is still unset. Pin it to a fixed
            // placeholder so that auto-fill never runs, and strip it again
            // in scrub_panic_message as a second, independent line of
            // defense in case any future integration sets it another way.
            server_name: Some("naden-client".into()),
            before_send: Some(Arc::new(scrub_panic_message)),
            ..Default::default()
        },
    )))
}

/// Strips the raw panic message and the machine hostname before
/// transmission, keeping only the exception type, source location, and
/// stacktrace. A panic message could contain a hostname, file path, or
/// other interpolated value from a call site this can't exhaustively audit;
/// the location is normally enough to find and fix the panic without ever
/// risking that kind of leak. `server_name` is cleared here too, redundant
/// with the fixed placeholder set in `init`'s `ClientOptions` — this is the
/// line that actually determines what gets transmitted, since it runs last.
fn scrub_panic_message(mut event: Event<'static>) -> Option<Event<'static>> {
    for exception in event.exception.iter_mut() {
        exception.value = None;
    }
    event.server_name = None;
    Some(event)
}

#[cfg(test)]
#[path = "crash_reporting_tests.rs"]
mod tests;
