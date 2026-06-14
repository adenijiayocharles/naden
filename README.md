# SSHelter

A fast, secure desktop application for managing SSH connections. Built for engineers who manage many servers and need an organised, keyboard-driven workflow without scattered config files or plaintext credentials.

## Features

- **Server inventory** — add, edit, and organise servers with display name, hostname/IP, port, username, tags, and groups
- **One-click connect** — launch sessions in the built-in terminal or your system terminal
- **Built-in terminal** — multi-tab terminal emulator (up to 20 concurrent sessions) with drag-to-reorder tabs
- **SFTP browser** — browse, upload, download, and chmod files over SFTP alongside your terminal sessions
- **Credential vault** — AES-256 encrypted local storage for SSH keys and passwords; unlocked via master password
- **Jump host support** — define bastion/proxy-jump chains (A → B → C) that resolve automatically on connect; wired automatically when importing from `~/.ssh/config`
- **Port forwarding** — manage local, remote, and dynamic (SOCKS5) SSH tunnels per server; start/stop individually with live status
- **Command snippets** — save and send reusable shell commands to the active terminal session
- **Fuzzy search** — real-time search across server name, hostname, IP, username, and tags
- **SSH config import** — parse `~/.ssh/config`, preview hosts, and import with ProxyJump relationships resolved
- **Audit log** — local log of every connection attempt with timestamp, host, username, duration, and outcome; exportable to CSV
- **System tray** — quick-connect to any server or open an SFTP session directly from the menu bar
- **Wake reconnect** — automatically reconnects sessions that drop when the machine sleeps
- **Broadcast** — fan out terminal input to multiple sessions at once, with a confirmation guard for destructive commands
- **Playbooks** — save multi-step command sequences with per-step delays and run them against one or more sessions
- **AI assistant** — bring-your-own-key chat panel (OpenAI or Anthropic) with optional terminal context for troubleshooting

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop framework | [Tauri v2](https://tauri.app/) |
| Frontend | React 18 + TypeScript + Tailwind CSS v4 |
| State management | Zustand |
| Terminal emulator | xterm.js + xterm-addon-fit |
| Backend | Rust |
| SSH | `ssh2` crate (libssh2 + vendored OpenSSL) |
| Credential vault | `aes-gcm` (AES-256-GCM), key derived via `pbkdf2`/`sha2` from the master password |
| Fuzzy search | `nucleo` crate |
| SSH config parsing | `ssh2-config` crate |
| Local database | SQLite via `sqlx` |

## Prerequisites

- [Rust toolchain](https://rustup.rs/) (see `rust-version` in `src-tauri/Cargo.toml`)
- Node.js ≥ 20 and npm
- macOS: Xcode Command Line Tools (`xcode-select --install`)

## Getting Started

```bash
# Install frontend dependencies
npm install

# Start the dev build (Vite + Rust hot-reload)
npm run tauri dev
```

## Building for Production

```bash
npm run tauri build
```

This compiles the Rust backend, bundles the React frontend, and produces a platform-native installer in `src-tauri/target/release/bundle/`.

## Development Commands

### Frontend

```bash
npm run dev          # Vite dev server (UI only, no Rust backend)
npm run build        # Bundle frontend to dist/
npm run typecheck    # tsc --noEmit
npm test             # Vitest (run once)
npm run test:watch   # Vitest (watch mode)
```

### Rust backend

```bash
cargo check                   # Fast type-check (no binary output)
cargo clippy -- -D warnings   # Linter
cargo fmt --check             # Format check
cargo test                    # All unit tests
```

Run these from the `src-tauri/` directory, or prefix with `cargo -C src-tauri`.

## Project Structure

```
src/
  components/
    layout/       # AppShell, Sidebar, TopBar, tab bar, vault countdown
    servers/      # Server list, card, row, form, bulk actions, port forwards section
    terminal/     # Terminal pane and tab management, broadcast grid, playbook run bar, AI assistant panel
    sftp/         # SFTP browser, file list, toolbar, chmod dialog
    tunnels/      # Port forward management panel
    snippets/     # Command snippet list and form
    playbooks/    # Playbook list and editor
    vault/        # Lock screen and setup modal
    settings/     # Settings modal
    log/          # Audit log view
    onboarding/   # First-run wizard
    shared/       # Error boundary, connection overlay, shared inputs
  hooks/          # useAppInit, useWakeReconnect, useKeyboardShortcuts, useVaultHeartbeat, useMenuEvents, useTrayEvents
  store/          # Zustand stores (server, terminal, sftp, tunnel, snippet, playbook, broadcast, assistant, ui, vault)
  lib/            # Tauri command wrappers, session buffer, vault activity, clipboard clear
  types/          # Shared TypeScript types

src-tauri/src/
  commands/       # Tauri command handlers (ssh, sftp, vault, server, settings, log, tunnel, snippet, assistant)
  ssh/            # Connection manager, jump host tunnelling, SSH config parser, launcher
  sftp/           # SFTP session manager
  tunnel/         # Local, remote, and dynamic port-forward engine
  vault/          # AES-256-GCM credential vault, master password
  db/             # SQLite queries and migrations
  search/         # nucleo-based fuzzy search
  platform/       # macOS-specific native integrations
  models/         # Shared data models
```

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Focus search |
| `⌘N` / `Ctrl+N` | Add new server |
| `⌘,` / `Ctrl+,` | Open settings |

## Security Notes

- Credentials (SSH keys, passwords) are stored AES-256-GCM encrypted in the local SQLite database, keyed by a PBKDF2-derived master password
- The vault is locked automatically after a period of inactivity
