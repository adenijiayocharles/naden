# SSH Manager — Features

## Everything you need to manage servers, nothing you don't.

SSH Manager replaces scattered config files, sticky-note passwords, and five different terminal windows with one fast, secure desktop app.

---

## Organised server inventory

Stop digging through `~/.ssh/config` to remember which IP belongs to which project. SSH Manager gives every server a name, a group, a colour, and tags — so your infrastructure is always one glance away.

- **Groups & colours** — organise servers by project, environment, or team. Collapse groups you're not working in.
- **Tags** — cross-cutting labels for when one server belongs to multiple contexts (e.g. `#production` and `#eu-west`).
- **Favourites** — star the servers you connect to most and filter to just those in one click.
- **Notes** — attach free-text notes to any server. They show up as a tooltip so they're always within reach without cluttering the UI.
- **Bulk actions** — move, re-group, or delete dozens of servers at once without clicking through each one.

---

## Connect in one click

Click a server, get a shell. No commands to remember, no flags to look up.

- **Built-in terminal** — a full terminal emulator inside the app. Open multiple sessions side-by-side in tabs, drag to reorder, and switch between them instantly.
- **System terminal** — prefer iTerm2 or Windows Terminal? SSH Manager can hand off to your native terminal app instead.
- **Multi-session tabs** — keep a production shell, a staging shell, and a log tail all open at the same time.
- **Auto-reconnect** — if your laptop wakes from sleep and a session drops, SSH Manager reconnects it automatically.
- **Jump host support** — connect through bastion servers without touching a command line. Chain up to 10 hops and SSH Manager handles the tunnel for you.

---

## Built-in SFTP browser

Transfer files without a separate client. Browse any server's filesystem directly in the app.

- Navigate folders with a clickable breadcrumb path.
- Upload and download files with a native file picker.
- Create folders, rename files, and delete items — all with inline confirmations so you never accidentally destroy something.
- Transfer progress shown in real time.

---

## Credential vault — secure by design

Your passwords and SSH keys are encrypted and stored in the OS keychain (Keychain Access on macOS, Windows Credential Manager on Windows). They never leave your machine.

- **Master password** — optionally lock the entire vault behind a single password. Rate-limited and strength-checked at setup.
- **Auto-lock** — the vault locks itself after a configurable idle period (5 min, 15 min, 30 min, 1 hour, or 2 hours). A countdown timer in the toolbar keeps you informed.
- **One-click copy** — copy a server's password to the clipboard directly from the server list. It's automatically cleared after 10 seconds.
- **Zero cloud** — credentials are never synced, transmitted, or backed up remotely. Full stop.

---

## Find any server in under a second

With dozens or hundreds of servers, search is everything. SSH Manager's fuzzy search scans display names, hostnames, IPs, usernames, and tags simultaneously — results appear as you type.

- Filter by group, tag, or favourites from the sidebar.
- Sort by name, hostname, or last connected time.
- Switch between a card grid and a compact row view depending on how much you need to see.

---

## Import from your existing SSH config

Already have a `~/.ssh/config`? Import it in seconds. SSH Manager parses every `Host` entry, shows you a preview, and lets you pick exactly which ones to bring in. Identity files, custom ports, and usernames all carry over automatically.

---

## Connection logs

Every connection attempt is recorded — automatically, with no setup required.

| What's tracked | Details |
|---|---|
| Timestamp | Exact time the session started |
| Server | Which server was connected to |
| Outcome | Success, Closed, Failed, or Connecting |
| Duration | How long the session lasted |
| Error detail | Full error message on failed connections |

Filter logs by server or date range, sort by any column, and export everything to CSV for auditing or incident review.

---

## A terminal that feels right

The built-in terminal isn't an afterthought.

- Full ANSI colour support, including 256-colour and true-colour sequences.
- The accent colour you choose in settings flows into the terminal — cursor, selection highlight, and even the `user@host` in your shell prompt.
- `Cmd/Ctrl+F` opens an in-terminal search bar with next/previous navigation.
- Configure font size (10–20 px), scrollback buffer (up to 50 000 lines), and copy-on-select to match your workflow.

---

## Personalise everything

SSH Manager adapts to how you work, not the other way around.

- **4 themes** — Dark, OLED, Dim, and Light.
- **9 accent colours** — Lime, Green, Cyan, Blue, Purple, Orange, Pink, Red, and White. The accent colour touches every interactive element in the app.
- **Keyboard shortcuts** — `Cmd+K` to search, `Cmd+N` to add a server, `Cmd+,` for settings — standard shortcuts you already know.

---

## Backup & restore

Export your entire server list to an encrypted `.sshbak` file you can take anywhere. Import it on a new machine in seconds. Credentials are never included in the backup — they stay in the OS keychain where they belong.
