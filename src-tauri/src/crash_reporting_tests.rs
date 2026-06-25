use super::*;

#[test]
fn init_is_a_noop_when_disabled() {
    assert!(init(false).is_none());
}

#[test]
fn non_empty_treats_an_unset_ci_secret_the_same_as_no_dsn() {
    // GitHub Actions substitutes "" for a referenced-but-unset secret, not
    // an absent variable — option_env! would see Some(""), not None.
    assert_eq!(non_empty(Some("")), None);
}

#[test]
fn non_empty_passes_through_a_real_dsn() {
    assert_eq!(
        non_empty(Some("https://key@o0.ingest.sentry.io/1")),
        Some("https://key@o0.ingest.sentry.io/1")
    );
}

#[test]
fn non_empty_passes_through_none() {
    assert_eq!(non_empty(None), None);
}

#[test]
fn scrub_panic_message_drops_exception_value_but_keeps_the_exception() {
    let mut event = Event::default();
    event.exception.values.push(sentry::protocol::Exception {
        ty: "panic".into(),
        value: Some("password is wrong".into()),
        ..Default::default()
    });

    let scrubbed = scrub_panic_message(event).expect("event should still be sent");

    assert_eq!(scrubbed.exception.len(), 1);
    assert_eq!(scrubbed.exception[0].value, None);
    assert_eq!(scrubbed.exception[0].ty, "panic");
}

#[test]
fn scrub_panic_message_clears_the_machine_hostname() {
    // The `contexts` integration fills server_name with the real machine
    // hostname regardless of send_default_pii — confirmed leaking the
    // device owner's name on typical macOS setups. This must not survive.
    let mut event = Event::default();
    event.server_name = Some("Janes-MacBook-Pro.local".into());

    let scrubbed = scrub_panic_message(event).expect("event should still be sent");

    assert_eq!(scrubbed.server_name, None);
}
