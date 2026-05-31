import { useState } from "react";

export function PathBar({ path, busy, onNavigateTo }: { path: string; busy: boolean; onNavigateTo: (p: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");

  const commit = () => {
    setEditing(false);
    const t = input.trim();
    if (t && t !== path) onNavigateTo(t);
  };

  const segments = path.split("/").filter(Boolean);
  const MAX = 4;
  const truncated = segments.length > MAX;
  const visible = truncated ? segments.slice(-MAX) : segments;
  const hiddenDepth = segments.length - visible.length;

  if (editing) {
    return (
      <input
        autoFocus
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        onBlur={commit}
        className="flex-1 h-7 bg-surface-3 border border-accent rounded px-2 text-sm text-white outline-none"
      />
    );
  }

  return (
    <div className="flex items-center gap-0.5 min-w-0 text-sm overflow-hidden flex-1 cursor-text" onClick={() => { setInput(path); setEditing(true); }}>
      {busy && (
        <svg className="w-4 h-4 animate-spin text-accent-fg shrink-0 mr-1" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      <button onClick={(e) => { e.stopPropagation(); onNavigateTo("/"); }} disabled={busy} className="text-faint hover:text-white disabled:pointer-events-none transition-colors shrink-0">/</button>
      {truncated && (
        <>
          <button onClick={(e) => { e.stopPropagation(); onNavigateTo("/" + segments.slice(0, hiddenDepth).join("/")); }} disabled={busy} className="text-faint hover:text-white disabled:pointer-events-none transition-colors shrink-0 px-0.5" title={`/${segments.slice(0, hiddenDepth).join("/")}`}>…</button>
          <span className="text-dim shrink-0">/</span>
        </>
      )}
      {visible.map((seg, i) => {
        const segPath = "/" + segments.slice(0, hiddenDepth + i + 1).join("/");
        const isLast = i === visible.length - 1;
        return (
          <span key={segPath} className="flex items-center gap-0.5 min-w-0">
            <button onClick={(e) => { e.stopPropagation(); if (!isLast) onNavigateTo(segPath); }} disabled={busy || isLast} className={`truncate transition-colors disabled:pointer-events-none ${isLast ? "text-secondary" : "text-faint hover:text-white"}`}>{seg}</button>
            {!isLast && <span className="text-dim shrink-0">/</span>}
          </span>
        );
      })}
    </div>
  );
}

interface LeftPaneServer {
  id: string;
  displayName: string;
}

interface Props {
  currentPath: string;
  selectedCount: number;
  selectedHasDir: boolean;
  hasClipboard: boolean;
  clipboardMode: "cut" | "copy" | null;
  onPaste: () => void;
  showHidden: boolean;
  onToggleHidden: () => void;
  busy: boolean;
  onNavigateTo: (path: string) => void;
  onNavigateUp: () => void;
  onRefresh: () => void;
  onUpload: () => void;
  onDownload: () => void;
  onNewFolder: () => void;
  onNewFile: () => void;
  editingCount?: number;
  showLocalPane: boolean;
  onToggleLocalPane: () => void;
  activePane?: "local" | "remote";
  localSelectedCount?: number;
  leftPaneSelection: string;
  onLeftPaneChange: (value: string) => void;
  leftPaneServers: LeftPaneServer[];
}

function ToolbarBtn({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-muted hover:text-white hover:bg-surface-4 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}

export default function SftpToolbar({
  currentPath,
  selectedCount,
  selectedHasDir,
  hasClipboard,
  clipboardMode,
  onPaste,
  showHidden,
  onToggleHidden,
  busy,
  onNavigateTo,
  onNavigateUp,
  onRefresh,
  onUpload,
  onDownload,
  onNewFolder,
  onNewFile,
  editingCount = 0,
  showLocalPane,
  onToggleLocalPane,
  activePane = "remote",
  localSelectedCount = 0,
  leftPaneSelection,
  onLeftPaneChange,
  leftPaneServers,
}: Props) {
  const hasSelection = selectedCount > 0;
  const canDownload = hasSelection && !selectedHasDir;
  const remoteActive = !showLocalPane || activePane === "remote";

  return (
    <div className="flex flex-col shrink-0 bg-surface-2 border-b border-stroke-subtle">
      <div className="h-12 flex items-center gap-1 px-2">
        <button
          onClick={onToggleLocalPane}
          title={showLocalPane ? "Hide left pane" : "Show left pane"}
          className={`p-1.5 rounded transition-colors ${
            showLocalPane ? "text-white bg-surface-4" : "text-muted hover:text-white hover:bg-surface-4"
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
            <rect x="1" y="2" width="14" height="12" rx="1.5" />
            <path strokeLinecap="round" d="M6 2v12" />
          </svg>
        </button>

        {showLocalPane && (
          <select
            value={leftPaneSelection}
            onChange={(e) => { onLeftPaneChange(e.target.value); }}
            className="text-sm bg-surface-3 border border-stroke-subtle rounded px-2 py-1.5 text-white focus:outline-none focus:ring-1 focus:ring-accent/50 leading-none"
          >
            <option value="local">Local</option>
            {leftPaneServers.map((s) => (
              <option key={s.id} value={s.id}>{s.displayName}</option>
            ))}
          </select>
        )}

        {/* Remote controls — dimmed when local pane is focused */}
        <div className={`flex items-center gap-1 transition-opacity duration-150 ${remoteActive ? "" : "opacity-40"}`}>
          <div className="w-px h-5 bg-surface-4 mx-1" />
          <ToolbarBtn onClick={onNavigateUp} disabled={busy || currentPath === "/"} title="Up (remote)">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12V4M4 8l4-4 4 4" />
            </svg>
          </ToolbarBtn>

          <ToolbarBtn onClick={onRefresh} disabled={busy} title="Refresh remote (⌘R)">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 8A5 5 0 113 8" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 4v4h-4" />
            </svg>
          </ToolbarBtn>

          <button
            onClick={onToggleHidden}
            title={showHidden ? "Hide dotfiles" : "Show hidden files"}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
              showHidden ? "text-white bg-surface-4" : "text-muted hover:text-white hover:bg-surface-4"
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
              {showHidden ? (
                <>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" />
                  <circle cx="8" cy="8" r="2" />
                </>
              ) : (
                <>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" />
                  <circle cx="8" cy="8" r="2" />
                  <path strokeLinecap="round" d="M2 2l12 12" />
                </>
              )}
            </svg>
            {showHidden ? "Hide hidden" : "Show hidden"}
          </button>

          {hasClipboard && (
            <>
              <div className="w-px h-5 bg-surface-4 mx-1" />
              <ToolbarBtn onClick={onPaste} disabled={busy} title={`Paste ${clipboardMode === "copy" ? "(copy)" : "(move)"} here`}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
                  <rect x="2" y="4" width="10" height="11" rx="1" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1" />
                </svg>
                Paste {clipboardMode === "copy" ? "copy" : "move"}
              </ToolbarBtn>
            </>
          )}

          <div className="w-px h-5 bg-surface-4 mx-1" />

          <ToolbarBtn
            onClick={onUpload}
            disabled={remoteActive ? busy : busy || localSelectedCount === 0}
            title={remoteActive ? "Upload file to remote" : "Upload selected local files to remote"}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10V3M5 6l3-3 3 3M3 12h10" />
            </svg>
            Upload
          </ToolbarBtn>

          <ToolbarBtn onClick={onDownload} disabled={busy || !canDownload} title={remoteActive ? "Download selected from remote" : "Download selected remote files to local dir"}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v7M5 7l3 3 3-3M3 12h10" />
            </svg>
            Download{selectedCount > 1 && !selectedHasDir ? ` (${selectedCount})` : ""}
          </ToolbarBtn>

          <ToolbarBtn onClick={onNewFolder} disabled={busy} title="New folder on remote">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2 5a2 2 0 012-2h2.586l2 2H12a2 2 0 012 2v5a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 8v4M6 10h4" />
            </svg>
            New Folder
          </ToolbarBtn>

          <ToolbarBtn onClick={onNewFile} disabled={busy} title="New file on remote">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6M9 2l4 4M9 2v4h4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 9h4M8 7v4" />
            </svg>
            New File
          </ToolbarBtn>

        </div>
      </div>

      {/* Path row — hidden in split mode; each pane owns its own path bar */}
      {!showLocalPane && (
        <div className="flex items-center px-3 py-2.5 border-t border-stroke-subtle gap-3 min-w-0">
          <PathBar path={currentPath} busy={busy} onNavigateTo={onNavigateTo} />
          {hasClipboard ? (
            <span className="text-sm text-accent-fg shrink-0">
              ● {clipboardMode === "copy" ? "copied" : "cut"} — paste to move here
            </span>
          ) : null}
          {editingCount > 0 && (
            <span className="text-sm text-amber-400 shrink-0 flex items-center gap-1">
              <span className="animate-pulse">●</span>
              Watching {editingCount} file{editingCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
