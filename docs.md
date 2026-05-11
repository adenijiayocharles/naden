# SSH Manager — Feature Documentation

## Table of Contents

1. [Server Management](#1-server-management)
2. [SSH Connections](#2-ssh-connections)
3. [SFTP File Browser](#3-sftp-file-browser)
4. [Credential Vault](#4-credential-vault)
5. [SSH Config Import](#5-ssh-config-import)
6. [Search, Filtering & Sorting](#6-search-filtering--sorting)
7. [Logs](#7-logs)
8. [Settings](#8-settings)
9. [Bulk Actions](#9-bulk-actions)
10. [Jump Hosts](#10-jump-hosts)
11. [Onboarding](#11-onboarding)
12. [Keyboard Shortcuts](#12-keyboard-shortcuts)

---

## 1. Server Management

### Server Fields

| Field | Required | Notes |
|---|---|---|
| Display name | Yes | Shown in all views |
| Hostname / IP | Yes | Used for connection |
| Port | No | Defaults to 22 |
| Username | No | Used in SSH command |
| Auth method | Yes | SSH key or password |
| Identity file | Key auth only | Path to private key file; file picker opens `~/.ssh` by default |
| Password | Password auth only | Stored encrypted in the credential vault |
| Notes | No | Free-text; shown as tooltip in list |
| Group | No | Assigns server to a group |
| Tags | No | Multiple tags per server; created inline |
| Jump host | No | Select a bastion server to proxy through |
| Favourite | No | Star flag for quick filtering |

### CRUD Operations

- **Create** — Add Server button (top-right) or `Cmd/Ctrl+N`. Display name and hostname are required; all other fields are optional.
- **Edit** — Kebab menu → Edit, or click the edit button in the form. All fields are updatable including auth method and credentials.
- **Duplicate** — Kebab menu → Duplicate. Copies all fields including group, tags, notes, and auth method; credentials are linked from the original.
- **Delete** — Kebab menu → Delete. Requires confirmation. Removes the server and its stored credential from the vault.

### Groups

- Create groups with an optional colour (9 presets).
- Groups are shown as collapsible sections in the server list. Collapse state persists across sessions.
- Each group header shows a server count badge.
- Servers can be moved between groups via the kebab menu → Move to Group, or via bulk actions.
- Deleting a group moves its servers to ungrouped.

### Tags

- Tags are created inline while editing a server (type a name, press Enter or comma).
- A server can have unlimited tags.
- Tags can be used to filter the server list from the sidebar.
- The list view shows the first three tags per server, with a `+N` indicator if there are more.

### Reachability

- A coloured dot shows TCP reachability per server: green (reachable), red (unreachable), yellow (checking), or no dot (unknown).
- Trigger a check via kebab menu → Check Connectivity. Latency in milliseconds is shown in the tooltip when reachable.

---

## 2. SSH Connections

### Launch Methods

| Method | How to trigger | Where it opens |
|---|---|---|
| Built-in terminal | Click server card or row | New tab inside the app |
| System terminal | Kebab menu → System Terminal | Native terminal app (Terminal.app, iTerm2, etc.) |

### Built-in Terminal

- Each connection opens as a tab in the right panel. Tabs show the server name and a colour-coded status dot.
- Multiple sessions can be open simultaneously; click a tab to switch between them.
- Tabs can be reordered by dragging.
- The terminal is a full xterm.js emulator — ANSI colour, cursor movement, bold/italic, and all standard escape sequences work.
- The cursor and selection highlight use the active accent colour.
- The ANSI green colour slot (used by default bash/zsh prompts for `user@host`) is mapped to the accent colour.
- Font size, scrollback buffer size, and copy-on-select are all configurable in Settings. Changes apply to new sessions.

### In-terminal Search

- `Cmd/Ctrl+F` opens a floating search bar over the terminal.
- Type to jump to the first match (incremental). Press Enter for next match, Shift+Enter for previous.
- Escape or the × button closes search and clears the highlight.

### Connection States

| State | Tab dot colour | Description |
|---|---|---|
| Connecting | Yellow (pulsing) | SSH handshake in progress |
| Connected | Accent colour | Active session |
| Disconnected | Dark grey | Session ended cleanly |
| Error | Red | Connection failed or dropped |

- While connecting, an overlay shows the server name and a Cancel button to abort.
- On error, an overlay shows the error message with Reconnect and Close buttons.
- If the machine wakes from sleep, all sessions in the error state are automatically reconnected.

### Last Connected

- A "time ago" label (e.g. `2 hours ago`) is shown per server after a successful connection.
- This is derived from the logs and updates after every session.
- Servers can be sorted by last connected time.

---

## 3. SFTP File Browser

Open via kebab menu → Browse Files. Each SFTP session opens as its own tab alongside terminal tabs; both tab types live in the same tab bar separated by a divider.

### Navigation

- The toolbar shows the current remote path as a clickable breadcrumb. Each segment is a link to that directory. If the path is deep, the oldest segments collapse to `…`.
- **Up** button navigates to the parent directory.
- **Refresh** reloads the current directory listing.
- Click a folder to navigate into it. Click a file to select it.

### File Operations

| Action | Availability |
|---|---|
| Upload | Always; opens a local file picker |
| Download | File selected only |
| New Folder | Always; inline name input appears |
| Rename | File or folder selected; inline input appears |
| Delete | File or folder selected; inline confirmation banner appears |

- Upload and download show a progress banner with a spinner and the filename while the transfer is in progress.
- Rename and new folder inputs can be confirmed with Enter or cancelled with Escape.
- Delete requires an inline confirmation before executing.

### Connection States

- Connecting and error overlays match the terminal (with Reconnect and Close buttons).

---

## 4. Credential Vault

The vault protects stored SSH passwords and key passphrases. It is backed by the OS keychain (Keychain Access on macOS, Windows Credential Manager on Windows).

### Master Password

- On first launch, the onboarding wizard offers to set a master password. This can be skipped and enabled later in Settings → Security.
- The password must be at least 8 characters. A strength meter shows Too short / Weak / Moderate / Strong in real time.
- With a master password set, the vault lock screen appears on app launch (and after auto-lock).

### Auto-lock

- Configurable timeout in Settings → Security: Never, 5 min, 15 min, 30 min, 1 hour, or 2 hours.
- A countdown timer in the top bar shows time remaining. It turns yellow under 5 minutes and red under 1 minute.
- Any mouse movement or keypress resets the timer (throttled to once per minute).
- Auto-lock only activates when a master password is set.

### Vault Operations

- Passwords are stored when a server is saved with password auth. They are retrieved automatically when connecting.
- The **Copy Password** option (kebab menu, password-auth servers only) copies the password to the clipboard. The clipboard is automatically cleared after 10 seconds, with a countdown banner in the top bar.
- Credentials are deleted from the vault when a server is deleted or its auth method is changed.

### Changing Vault Settings

All password management is in Settings → Security:

- **Enable password** — set a new master password (with confirmation and strength meter).
- **Disable password** — requires entering the current password first.
- **Change password** — requires current password; new password must pass the strength check and be confirmed.
- **Lock now** — immediately locks the vault (button at the bottom of the Security section).

---

## 5. SSH Config Import

Access via the Import button in the top bar or during onboarding.

### Flow

1. Select a file (defaults to `~/.ssh/config`) using a native file picker.
2. The file is parsed and all `Host` entries are shown in a preview table with columns: Host pattern, Hostname, User, Port.
3. Check or uncheck individual entries. Select All and Deselect All buttons are available.
4. Click Import Selected to create servers from the checked entries.
5. A summary shows how many servers were imported and how many were skipped (already existed).

### Parsed Fields

| SSH config key | Maps to |
|---|---|
| `Host` | Display name |
| `HostName` | Hostname (falls back to Host pattern if absent) |
| `User` | Username |
| `Port` | Port (defaults to 22) |
| `IdentityFile` | Identity file path |

---

## 6. Search, Filtering & Sorting

### Fuzzy Search

- The search box in the top bar (`Cmd/Ctrl+K` to focus) runs a fuzzy search across display name, hostname, IP, username, and tags.
- Search fires after a 50 ms debounce.
- Search results are shown as a flat list regardless of active group/tag filters.

### Sidebar Filters

| Filter | How to activate |
|---|---|
| Favourites | Star icon at the top of the sidebar |
| By group | Click a group name |
| By tag | Click a tag name |

Filters are mutually exclusive — selecting one clears the others.

### Sort Modes

| Mode | Description |
|---|---|
| Default | Grouped sections, then ungrouped at the bottom |
| Name A → Z | All servers alphabetically ascending |
| Name Z → A | All servers alphabetically descending |
| By hostname | Alphabetical by hostname/IP |
| By last connected | Most recently connected first |

Sort mode is selected from a dropdown in the top bar and persists across sessions.

### View Modes

- **Card view** — Grid of cards, each showing all server details, tags, and action buttons.
- **Row view** — Compact table rows, better for long lists.

Toggle between views with the card/row buttons in the top bar.

---

## 7. Logs

The Logs view (clock icon in the sidebar) shows a record of every connection attempt.

### Columns

| Column | Description |
|---|---|
| Time | When the session started |
| Server | Display name of the server |
| Host | Hostname and port |
| User | Username used |
| Outcome | Status of the connection (see below) |
| Duration | How long the session lasted |

Hover over a row to see the full error message in a tooltip (if the connection failed).

### Outcomes

| Outcome | Meaning |
|---|---|
| **Connecting** | Initial state written when a session opens. Normally transitions to another outcome immediately. A stuck "Connecting" row indicates the app closed before the session resolved. |
| **Success** | The system terminal launched successfully. Because the app hands off to the native terminal, it cannot detect when you close it — so Success means "launched", not "disconnected". |
| **Closed** | The built-in terminal session ended cleanly (you typed `exit` or the remote shell exited normally). |
| **Failed** | The built-in terminal session ended with an error — auth failure, host unreachable, network drop, etc. The error message is stored and shown on hover. |
| **Timeout** | Reserved for future use. Currently, connect timeouts surface as Failed. |

### Filters

- **Server** — dropdown to show only entries for a specific server.
- **Date range** — start and end date pickers (end date is inclusive through 23:59:59).
- **Outcome chips** — All, Success, Failed, Timeout, Closed. This filter is client-side only and operates on already-loaded entries.

All filters can be combined. A Clear button removes all active filters.

### Sorting

Click the Time, Outcome, or Duration column headers to sort. Click again to reverse direction.

### Export

The Export CSV button downloads all entries matching the current server/date filters as a CSV file with columns: Time, Server, Host, Port, Username, Outcome, Duration (s), Error.

---

## 8. Settings

Open via the gear icon in the top bar or `Cmd/Ctrl+,`.

### Appearance

- **Theme** — Dark, OLED (pure black backgrounds), Dim (desaturated dark), or Light.
- **Accent colour** — 9 options: Lime (default), Green, Cyan, Blue, Purple, Orange, Pink, Red, White. The accent colour affects buttons, active states, status dots, folder icons in the SFTP browser, the terminal cursor, selection highlight, and ANSI green (used by shell prompts for `user@host`).

### Security

- Enable, disable, or change the master password for the credential vault.
- Set the auto-lock timeout.
- Lock the vault immediately.

### Terminal

- **Font size** — 10 px to 20 px. Applies to new sessions only.
- **Scrollback** — 500, 1 000, 5 000, 10 000, or 50 000 lines. Applies to new sessions only.
- **Copy on select** — When enabled, any text selected in the terminal is automatically copied to the clipboard.

### Data

- **Export backup** — Exports all servers, groups, and tags to an encrypted `.sshbak` file. You choose a backup password; credentials are not included.
- **Import backup** — Restores from a `.sshbak` file using the backup password. Shows a summary of imported and skipped records.

---

## 9. Bulk Actions

Enable bulk mode with the Select button in the top bar.

- Each server card or row displays a checkbox.
- Selected server count is shown in the top bar.
- **Select All** — selects all servers currently visible (respects active search/filter).
- **Clear** — deselects everything.
- **Move to Group** — moves all selected servers to a chosen group, or to ungrouped.
- **Delete** — deletes all selected servers after a confirmation prompt.

Exit bulk mode with the Cancel button or by toggling Select off.

---

## 10. Jump Hosts

A jump host (bastion) is an intermediary server the SSH connection tunnels through before reaching the target.

### Setup

1. Create a server for the bastion and check **This server is a jump host** in the form. It will be marked with a Jump badge in the list.
2. On the target server, open the form and select the bastion from the **Jump host** dropdown.
3. Chains of up to 10 hops are supported. The form shows a visual chain: `Your machine → Bastion → Target`.
4. Cycle detection is enforced — the app rejects circular references.

### Behaviour

- When you connect to the target, the app resolves the full chain and constructs the appropriate `ProxyJump` command automatically.
- Jump host resolution works for both built-in terminal and system terminal connections.

---

## 11. Onboarding

Shown on first launch (can be re-triggered if the `onboarding_complete` setting is cleared).

| Step | Content |
|---|---|
| 1 — Welcome | Introduction to SSH Manager |
| 2 — Vault | Option to set a master password or skip |
| 3 — Import | Option to import an SSH config file or skip |
| 4 — Done | Completion screen |

A progress bar tracks completion across the four steps. The wizard can be skipped at any step by completing it or clicking past the optional steps.

---

## 12. Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+K` | Focus the search box |
| `Cmd/Ctrl+N` | Open the Add Server form |
| `Cmd/Ctrl+,` | Open Settings |
| `Cmd/Ctrl+F` (in terminal) | Open in-terminal search |
| `Enter` (in-terminal search) | Jump to next match |
| `Shift+Enter` (in-terminal search) | Jump to previous match |
| `Escape` (in-terminal search) | Close search |
| `Enter` (tag input, rename, new folder) | Confirm |
| `Escape` (rename, new folder, delete confirm) | Cancel |
| `↑ / ↓` (kebab menu open) | Navigate menu items |
| `Escape` (kebab menu open) | Close menu |
