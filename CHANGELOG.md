# Changelog

All notable changes to naden are documented here.
## [v1.0.2] — 2026-07-01

### Features
- Make links clickable via WebLinksAddon *(terminal)*
## [v1.0.1] — 2026-07-01

### Features
- Close on Escape key *(modals)*
- Add download-as-zip and unzip-here to remote pane *(sftp)*
## [v0.2.7] — 2026-06-29

### Bug Fixes
- Exact substring matching in command palette; add tunnel results *(search)*
- Remove known-host entries for every hop in the jump chain *(ssh)*
- Playbook picker height adjusts to number of results *(terminal)*
- Snippet picker height adjusts to number of results *(terminal)*
- Apply drag opacity transition conditionally and lift z-index on menu open *(servers)*
- Fix stale results race condition and flash of No matches *(search)*

### Features
- Show server name in each tunnel row; remove creation from terminal panel *(tunnels)*
- Persist window size and position across sessions *(window)*
- Assistant panel polish — narrower sidebar/panel, animations, UX fixes *(ui)*
- Implement ⌘T, ⌘W, ⌘S, ⌘↑ keyboard shortcuts *(shortcuts)*
## [v0.2.6] — 2026-06-26

### Bug Fixes
- Fix button state, strip ANSI from log files, add delete confirmation *(recording)*
## [v0.2.5] — 2026-06-26

### Bug Fixes
- Include openrouter in AssistantPanel ready/configured checks *(assistant)*
- Fix tag cache staleness, stuck delete modals, CI test gate, deployment target, sftp mutex consistency (#A–#H) *(reaudit)*
- Rename symlink escape, health Option<f64>, broadcast warn on persist fail (#19 #20 #21) *(low)*
- Remove unused shell plugin, fix mutex panic, split god-hook (#16 #17 #18) *(hygiene)*
- Shared password strength, escape hook dedup, stable tray listener *(frontend)*
- NotFound on missing delete, port validation, broadcast DB helpers *(commands)*
- Back up DB before running migrations to prevent corruption on update *(db)*
- Drop unused fs:allow-read-file/write-file capabilities *(security)*
- Reject newline/null bytes in identity_file_path *(servers)*
- Close credential IDOR via server vault_credential_id *(vault)*
- Match host text size to other ServerCard metadata *(servers)*

### Features
- Add OpenRouter as a third AI provider *(assistant)*
- Add frontend crash reporting and flip default to opt-out *(sentry)*
- Drag-to-reorder servers with persistence *(frontend)*
- Add reorder_servers command *(backend)*
- Add sort_position column for server ordering *(db)*
- Per-hook confirmation prompt before running pre/post-connect hooks *(security)*
- Configure tauri-plugin-log and add SSH/vault/SFTP lifecycle logs *(logging)*
- Add opt-in Sentry crash reporting *(crash-reporting)*
- Warn before creating a master password that can't be recovered *(vault)*
- Add encrypted backup and restore *(vault)*
- Open the pane context menu on empty-space right-click *(sftp)*
- Add New Folder to the pane context menus *(sftp)*
- Select files with shift+arrow up/down *(sftp)*
- Add app-wide UI font and font-size picker *(settings)*
## [v0.2.4] — 2026-06-24

### Bug Fixes
- Allow terminal_ghost_suggestions in the settings allowlist *(settings)*
- Keep add/edit modal open after save, show save feedback *(servers)*
- Disable ghost suggestions by default *(terminal)*
- Restore mouse wheel scrolling in alt-screen apps like nano *(terminal)*
- Make terminal output read event-driven instead of fixed-interval polling

### Features
- Queue port forwards in Add Server, fix dirty-tracking gaps *(servers)*
- Add resizable column headers to file browser lists
- Add built-in local shell terminal sessions
## [v0.2.3] — 2026-06-19

### Bug Fixes
- Address security and quality issues #1–#21, #23–#24
- Disable macOS auto-capitalisation and autocorrect on all inputs

### Features
- Extend command palette search and fix terminal focus stealing
## [v0.2.1] — 2026-06-18

### Bug Fixes
- Security, performance, and code quality hardening
- Restore session continuity after auto-reconnect *(broadcast)*
- Apply custom accent colour on launch via useAppInit *(appearance)*

### Features
- Per-server terminal theme override
- Drag files from Finder onto the remote pane to upload *(sftp)*
- Command palette (⌘K), broadcast group naming prompt, focus ring removal
- Add ability to import and export to ssh config
- Tabbed server form with Advanced sub-tabs
- Per-server env vars and pre/post connection hooks
- Session recording, inline tunnel picker, and key management
- Server health overlay — CPU, memory, disk via SSH *(health)*
- Replace broadcast envelope icon with radio tower *(sidebar)*
- Dedicated group tab, session isolation, and context-aware UI *(broadcast)*
- Exponential backoff reconnect, tab rename, SSH agent, initial dir, broadcast group persistence
- Add ghost suggestions toggle and fix font weight *(terminal)*
- Convert server.png to SVG component that inherits accent colour *(logo)*
- Add custom accent colour picker *(appearance)*
- Add custom accent colour picker (#13) *(appearance)*
## [v0.2.0] — 2026-06-15

### Bug Fixes
- Make checkbox independently toggle row selection (#10)

### Features
- Add default terminal option for external SSH sessions (#11) *(settings)*
- Add default terminal option for external SSH sessions *(settings)*
## [v0.1.9] — 2026-06-15

### Bug Fixes
- Ignore menu actions while the vault is locked *(menu)*
- Grant dialog ask/message for update prompts *(permissions)*
- Correct invalid char literal in SFTP edit-allowed extensions
- Close IPC boundary gaps, add vault/search test coverage, fix tunnel mutex panics
- Avoid .app suffix in macOS bundle identifier

### Features
- Surface specific AI provider errors (invalid key, rate limit, outage)
- Automatic periodic update checks, drop manual menu item
- Complete shadcn/ui migration across all components
- Integrate shadcn/ui and apply to onboarding wizard
- Add host discovery (LAN scan + known_hosts import)
- Overwrite confirm, cancel button, select-all, and pane refresh *(sftp)*
- Cancellable transfers and recursive directory upload/download *(sftp)*
- Add AlreadyExists/Cancelled errors and cancel-transfer IPC *(sftp)*
- Add jump host/passphrase fields, fix card grid, edit-on-error

### Performance
- Lazy-load secondary views and streamline app setup
## [v0.1.6] — 2026-06-13

### Bug Fixes
- Show friendly error on duplicate group/tag names *(db)*
- Address security and performance review findings
- Close tool panel on session/tab switch *(terminal)*
- Remove redundant left border on new-tab button *(terminal)*
- Unify tab bar icon style for new tab, tools, and SFTP *(terminal)*

### Features
- Check for updates on startup and show version on lock screen
- Use sparkles icon for AI assistant toggle *(layout)*
- Add cursor style setting (block/underline/bar) *(terminal)*

### Performance
- Speed up session open with caching and parallel I/O *(terminal)*
## [v0.1.5] — 2026-06-13

### Bug Fixes
- Use sed range starting at line 1 for Cargo.toml version bump *(scripts)*
- Use cog icon for Settings nav item *(sidebar)*

### Features
- Add button to remove stale known_hosts entry on host-key mismatch *(connection)*
- Move AI assistant, playbook, and snippet triggers to tab bar *(terminal)*
- Add line height setting *(terminal)*
## [v0.1.4] — 2026-06-12

### Bug Fixes
- Bump version to 0.1.2 and guard against tag/version mismatch *(release)*
- Disable browser autocomplete on add/edit server form inputs *(servers)*
## [v0.1.3] — 2026-06-12

### Features
- Show confirmation dialog for Check for Updates *(menu)*
- Refresh macOS app menu with newer features and updater *(menu)*
## [v0.1.1] — 2026-06-11

### Bug Fixes
- Resolve clippy lints in key_commands *(keys)*
- Security and performance hardening *(keys)*
- Overhaul light mode — hierarchy, shadows, semantic status tokens *(theme)*
- Deactivate nav items when settings view is active *(sidebar)*
- Security and performance hardening (frontend) *(assistant)*
- Security and performance hardening (Rust backend) *(assistant)*

### Features
- Add in-app auto-updater via Tauri updater plugin
- SSH key management system *(keys)*
- Wire onRunCommand to terminal input in TerminalPane *(assistant)*
- Dual-provider UI — add/forget/switch per provider *(assistant)*
- Support two API keys (OpenAI + Anthropic) simultaneously *(assistant)*
- Add ConfirmDeleteModal component *(shared)*
- Move settings from modal to sidebar nav item *(settings)*
- Tag conversations with provider, warn on provider mismatch *(assistant)*
- Add change-provider form to AI assistant section *(settings)*
- Widen panel, auto-grow textarea, polish UI *(assistant)*
## [v0.1.0] — 2026-06-07

### Bug Fixes
- Keep password prompts out of broadcast fan-out *(terminal)*
- Expose retrieve_credential as a Tauri command *(vault)*
- Use template icon and drop redundant left-click handler *(tray)*
- Re-arm cursor blink animation on focus restore *(terminal)*
- Vault and SFTP store error handling *(correctness)*
- SFTP live-edit debounce and partial-upload cleanup *(data-integrity)*
- SSH session read-loop and timeout handling *(correctness)*
- Validate hostname and identity path in SSH config import *(security)*
- Harden vault IPC surface and brute-force protection *(security)*
- Hide dotfiles by default; sync show-hidden across all panes *(sftp)*
- Align tab bar height with server-list toolbar *(layout)*
- Prevent macOS elastic-scroll white edges *(shell)*
- Fix asymmetric spacing around server cards *(ui/servers)*
- Correct behaviour bugs in peer pane and live-edit tracking *(sftp)*
- Harden SFTP against MITM, path traversal, and XSS *(security)*
- Progress bar not showing during transfers *(sftp)*
- Move peerSessionExists after peerSessionId declaration *(sftp)*
- Resolve maximum update depth loop in SftpBrowser *(sftp)*
- Run PBKDF2 key derivation on spawn_blocking *(vault)*
- Show error modal without message for failures, surface max-sessions error in tab picker *(connection)*
- Snippet icon toggles picker open/closed *(terminal)*
- Style Move to group button as primary (accent) *(bulk-bar)*
- Normalize server list toolbar controls to h-8 / text-sm *(toolbar)*
- Apply Button component to all bulk action buttons *(bulk-bar)*
- Unify font size to text-sm across all sizes *(button)*
- Use Button component for Add and Delete trigger buttons *(sidebar)*
- Increase input and button height from h-8 to h-10 (32→40px) *(ui)*
- Unify input and button heights to h-8 (32px) *(server-form)*
- Prevent card grid overflowing when scrollbar is present *(servers)*
- Remove accent border from connected server cards *(servers)*
- Remove right margin from terminal container *(terminal)*
- Remove Connected badge that broke card layout *(servers)*
- Fix search navigation always returning first result *(terminal)*
- Address all findings from UI appraisal *(ui)*
- Resolve all code review findings (security, performance, duplication)
- Fix font settings breaking when font already cached *(terminal)*
- Fix readonly cols/rows error when updating options post-open *(terminal)*
- Fix font loading, cursor blink, and CSS injection in production builds *(terminal)*
- Fix find navigation always returning first result, add arrow key support *(terminal)*
- Clear editing file entry after successful sync *(sftp)*
- Address security, performance, and duplication findings from review
- Address 4 code review findings
- Correctly restore minimized window on Dock icon click *(macos)*
- Restore window when dock icon clicked while minimized *(macos)*
- Eliminate white flash on launch and add per-pane path bars in SFTP split view
- Use dark text on Apply button in permissions modal *(sftp)*
- Fix single-click navigation and overhaul file list column layout *(sftp)*
- Address 16 code review findings across security, correctness, and performance
- Surface actual error message when SFTP paste fails
- Reliable window dragging via native ObjC NSEvent monitor *(drag)*
- Dark overlay title bar on macOS *(window)*
- Transparent scrollbar track on xterm viewport
- Set terminal background on .xterm not .xterm-viewport
- Pin .xterm-viewport background to surface-1 theme color
- Match terminal gutter color to xterm background (surface-1)
- Add internal padding to xterm terminal content area
- Use absolute inset positioning for terminal padding
- Use dark terminal colors in light theme
- Register session listeners before spawning Rust thread
- Reconnect connected sessions on wake, not just errored ones
- Rename "Audit Log" to "Logs" in sidebar and search placeholder
- Use accent color throughout terminal and SFTP views
- Try SSH agent for passphrase-protected keys with no stored passphrase
- Correct key_is_encrypted false positive, better key error messages
- Distinguish passphrase-protected keys from bad key format
- Bundle OpenSSL so libssh2 supports OpenSSH private key format
- Refresh server cache after SSH config import
- Move useMemo calls above isLoading early return in ServerList
- Address all security, bug, and code quality issues from audit
- Open group submenu to the left in row view *(kebab)*
- Open group submenu to the right *(kebab)*
- Keep error session alive when terminal:closed follows terminal:error *(terminal)*
- Implement password storage and prompt for password-auth servers *(auth)*
- Replace hardcoded/Unix-only paths with platform-safe Tauri APIs
- Address code review findings across Rust and frontend
- Correct toggle switch layout for master password and copy-on-select *(settings)*
- Make modal body scrollable *(settings)*
- Auto-unlock on restart when password protection is disabled *(vault)*
- Hide Copy Password when locked, add recovery on corrupted vault *(vault)*
- Hide Add Server and show hint in empty favourites view *(favourites)*
- Use targeted SQL update to avoid clearing group and notes *(favourites)*
- Add 10s connect timeout to all TCP connections *(ssh)*
- Allow clearing notes, identity file, group, and jump host *(servers)*
- Use tauri::async_runtime::spawn for auto-lock task *(runtime)*
- Re-fetch server store after import so servers appear immediately *(backup)*
- Close audit log when clicking any server/group/tag nav item *(ui)*
- Add dialog:allow-save and fs:allow-write-text-file for CSV export *(permissions)*
- Prevent dangling threads and zombie SSH sessions on close *(terminal)*
- Remove overflow-hidden from row list so dropdown isn't clipped *(ui)*
- Keep all sessions mounted for true tab independence *(terminal)*
- Wait for osascript to exit so Terminal launch errors surface
- Normalize dropdown height to match text inputs
- Open file browser at ~/.ssh by default for identity file picker
- Register tauri_plugin_dialog so file picker works

### Features
- Add server-scoped command playbooks *(terminal)*
- Add multi-server command broadcast *(terminal)*
- Add create/delete UI and search to port forwards panel *(tunnels)*
- Add selectable colour themes *(terminal)*
- Replace OS keychain with AES-256-GCM encrypted SQLite storage *(vault)*
- Decorative network graph on lock screen background *(vault)*
- Group color tint on server cards and rows *(servers)*
- Flat list in All Servers view *(servers)*
- Auto-close tab when shell exits cleanly *(terminal)*
- Wire ProxyJump relationships during SSH config import *(ssh-import)*
- Port forward management UI *(tunnels)*
- SSH tunnel engine with local, dynamic, and remote forwarding *(tunnels)*
- Port forward data model and CRUD *(tunnels)*
- Touch ID biometric vault unlock *(security)*
- Add menubar icon with per-server connect & SFTP shortcuts *(tray)*
- Add transfer progress bar below toolbar *(sftp)*
- Open peer sessions as hidden — no new tab, no focus steal *(sftp)*
- Show all servers in left-pane dropdown, auto-open sessions *(sftp)*
- Add remote-to-remote transfer mode in SftpBrowser *(sftp)*
- Add cross-session file transfer command *(sftp)*
- Add clear logs with confirm modal, outcome filter dropdown, and empty states *(logs)*
- Add shared EmptyState component and wire across server and snippet screens *(empty-states)*
- Replace logo SVGs with server.png *(onboarding)*
- Replace terminal SVG logo with server.png *(landing)*
- Replace app icon with server.png, remove unused formats *(icons)*
- Show snippet count on Snippets nav row *(sidebar)*
- Bash syntax highlighting in snippet editor *(snippets)*
- Add snippet picker button to terminal pane *(terminal)*
- Add command snippets manager *(snippets)*
- Show only name or IP in narrow list view when panel is open *(server-list)*
- Add delete variant (solid red), clean up bulk bar *(button)*
- Remove notes field end-to-end
- Remove notes field from UI *(servers)*
- Add shared Input and Button components, inject everywhere *(ui)*
- Accent color for active auth method button *(server-form)*
- Replace tag kebab menu with right-click context menu *(sidebar)*
- Add overflow scroll with fade edges and arrow buttons *(tabs)*
- Use Tauri clipboard-manager plugin for copy-on-select *(terminal)*
- Add drag-and-drop between local and remote panes *(sftp)*
- Add new terminal session picker to tab bar
- Add open SFTP browser button to terminal tab bar
- Add documentation section *(landing)*
- Add real app screenshots *(landing)*
- Add marketing landing page *(landing)*
- Make New Folder, New File, Hide Hidden, Upload, Download context-aware *(sftp)*
- Make toolbar context-aware of active pane + smooth scroll *(sftp)*
- Add context menu to local file pane *(sftp)*
- Add local file browser with dual-pane transfer *(sftp)*
- Add native macOS menu bar
- Copy function with toolbar paste button *(sftp)*
- Add up-directory button to toolbar *(sftp)*
- Restore clickable path breadcrumb in toolbar *(sftp)*
- Power features — chmod, edit-with-watch, sync, symlink indicator *(sftp)*
- Navigation history, path input, sort columns, hidden files toggle *(sftp)*
- File operations — multi-select, inline rename, bulk delete/download, new file, cut/paste move *(sftp)*
- Auto-reconnect with 20s countdown on unexpected disconnect *(terminal)*
- Status bar with server count and add/import menu *(sidebar)*
- Full-width topbar, collapsible sidebar, search toolbar *(layout)*
- Minimal title bar with session name and panel controls *(topbar)*
- Unified sidebar rows with context menus for groups and tags
- Add ability to delete tags
- Live-reload font size into open terminal tabs
- Bundle terminal fonts so users don't need to install them
- Add terminal font family setting with 10 open-source options
- Expand server list when clicking All Servers, groups, or tags
- Collapse server list when a session opens
- Map terminal ANSI green to accent color for user@host prompt
- Expand audit log to full width when active with open panels
- Reconnect tabs after sleep
- Terminal tab reorder, light mode, remove SSH agent auth *(ui)*
- Search & navigation, audit log improvements, input height, accent tabs *(ui)*
- Sort controls, collapsible groups, last-connected, group colour dot *(server-list)*
- Add accent colour picker with 9 presets *(theme)*
- Add Dark / OLED / Dim theme system via CSS variables *(theme)*
- Show connection error modal when SSH connection fails
- Implement all UI/UX improvements *(ux)*
- Block app on launch until vault is configured *(vault)*
- Require master password before enabling auto-lock *(settings)*
- Vault auto-lock countdown + clipboard auto-clear *(security)*
- Add star button directly on cards and rows *(favourites)*
- Add Move to Group option to kebab menu *(servers)*
- Add favourites section to sidebar and kebab menu *(favourites)*
- Add Cancel button to connecting overlays *(ux)*
- Server duplication, bulk ops, sort, recent section, ping *(ux)*
- SFTP file browser with unified panel tabs *(sftp)*
- Session reconnect, search, per-session settings, copy-on-select *(terminal)*
- Onboarding wizard, keyboard shortcuts, vault auto-lock, skeleton loading *(3)*
- Encrypted backup, import, and connection notes display *(2D)*
- Audit log — record every connection attempt with outcome + duration *(2C)*
- Jump host / bastion support *(2B)*
- Collapsible server list drawer when terminal is open *(ui)*
- Indeterminate progress bar while session is connecting *(terminal)*
- Click opens built-in terminal; kebab gains System Terminal *(ui)*
- Click-to-connect cards/rows, Terminal moved to kebab menu *(ui)*
- Grid layout for card view, box-shaped cards *(ui)*
- Card / list view toggle for server list *(ui)*
- Focus terminal on connect so typing works immediately *(terminal)*
- Auto-close tab when SSH session ends *(terminal)*
- Pin Import/Add/Settings controls to right of TopBar *(ui)*
- Built-in terminal with xterm.js and ssh2 *(2A)*
- Vault password management and settings modal *(settings)*
- Fuzzy search, server cache, ErrorBoundary *(1F+hardening)*
- System terminal launch and SSH config import *(1E)*
- Credential vault — OS keychain, PBKDF2 master password, lock/unlock UI *(1D)*
- App shell, server list, and add/edit form UI *(1C)*
- Server CRUD commands, query layer, IPC bridge, Zustand store *(1B)*
- Add database schema, models, and AppState *(1A)*

### Performance
- Throttle progress events, debounce re-uploads, memoize filters *(sftp)*
- Compile crypto crates at opt-level 3 in debug builds *(vault)*

