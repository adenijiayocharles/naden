use super::*;

#[test]
fn pending_hook_is_none_for_an_absent_hook() {
    assert_eq!(pending_hook(None, None), None);
}

#[test]
fn pending_hook_is_none_for_an_empty_or_whitespace_only_hook() {
    assert_eq!(pending_hook(Some("   "), None), None);
}

#[test]
fn pending_hook_is_pending_for_a_brand_new_hook() {
    assert_eq!(pending_hook(Some("echo hi"), None), Some("echo hi"));
}

#[test]
fn pending_hook_is_none_once_the_exact_text_is_confirmed() {
    assert_eq!(pending_hook(Some("echo hi"), Some("echo hi")), None);
}

#[test]
fn pending_hook_ignores_surrounding_whitespace_on_either_side() {
    // The hook is trimmed before it's ever run, and the confirmed snapshot
    // is stored trimmed too — neither side should cause a false "pending"
    // just because of leading/trailing whitespace.
    assert_eq!(pending_hook(Some("  echo hi  "), Some("echo hi")), None);
}

#[test]
fn pending_hook_is_pending_again_after_the_command_changes() {
    assert_eq!(
        pending_hook(Some("echo bye"), Some("echo hi")),
        Some("echo bye")
    );
}

#[test]
fn pending_hook_is_none_after_clearing_a_previously_confirmed_hook() {
    assert_eq!(pending_hook(None, Some("echo hi")), None);
}
