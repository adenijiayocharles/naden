# Suggested Updates

## UX / Usability
- [x] Server duplication — clone an entry with one click (useful for similar servers)
- [x] Bulk operations — multi-select to delete or move servers to a group
- [x] Sort servers by name or last connected
- [x] "Recently connected" section at the top of the server list
- [x] Server ping / TCP port check to show reachability before connecting

## Terminal
- [x] Session reconnect — when a session drops, offer a reconnect button instead of just closing the tab
- [x] Per-session terminal settings (font size, scrollback limit) rather than hardcoded values
- [x] Copy selected text to clipboard automatically (xterm `copyOnSelect` option)
- [x] Terminal search (`Ctrl+F`) via xterm's `SearchAddon`

## Security
- [ ] Touch ID unlock via macOS `LocalAuthentication` through a Tauri plugin
- [ ] Vault auto-lock countdown indicator in the UI
- [ ] Clipboard auto-clear after copying a password (e.g. 30 seconds)

## Missing PRD Features (P3)
- [x] SFTP file browser
- [ ] Cloud sync for the server list (credentials stay local)

## Code Quality
- [x] Finish and commit in-progress work: all files were already complete
- [x] Frontend unit tests with Vitest — 24 tests across errors.ts and format.ts
- [x] Rust tests for SSH config parser (7 tests) and vault encryption/decryption roundtrip (8 tests)
