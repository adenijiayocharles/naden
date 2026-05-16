interface Props {
  currentPath: string;
  selectedCount: number;
  selectedHasDir: boolean;
  hasClipboard: boolean;
  showHidden: boolean;
  onToggleHidden: () => void;
  busy: boolean;
  onRefresh: () => void;
  onUpload: () => void;
  onDownload: () => void;
  onNewFolder: () => void;
  onNewFile: () => void;
  editingCount?: number;
  onSync?: () => void;
  syncProgress?: string | null;
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
      className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-muted hover:text-white hover:bg-surface-4 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
  showHidden,
  onToggleHidden,
  busy,
  onRefresh,
  onUpload,
  onDownload,
  onNewFolder,
  onNewFile,
  editingCount = 0,
  onSync,
  syncProgress,
}: Props) {
  const hasSelection = selectedCount > 0;
  const canDownload = hasSelection && !selectedHasDir;

  return (
    <div className="flex flex-col shrink-0 bg-surface-0 border-b border-stroke-subtle">
      <div className="h-10 flex items-center gap-1 px-2">
        <ToolbarBtn onClick={onRefresh} disabled={busy} title="Refresh (⌘R)">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 8A5 5 0 113 8" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 4v4h-4" />
          </svg>
        </ToolbarBtn>

        <button
          onClick={onToggleHidden}
          title={showHidden ? "Hide dotfiles" : "Show hidden files"}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
            showHidden ? "text-white bg-surface-4" : "text-muted hover:text-white hover:bg-surface-4"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
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

        <div className="w-px h-4 bg-surface-4 mx-1" />

        <ToolbarBtn onClick={onUpload} disabled={busy} title="Upload file">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10V3M5 6l3-3 3 3M3 12h10" />
          </svg>
          Upload
        </ToolbarBtn>

        <ToolbarBtn onClick={onDownload} disabled={busy || !canDownload} title="Download selected">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v7M5 7l3 3 3-3M3 12h10" />
          </svg>
          Download{selectedCount > 1 && !selectedHasDir ? ` (${selectedCount})` : ""}
        </ToolbarBtn>

        <ToolbarBtn onClick={onNewFolder} disabled={busy} title="New folder">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2 5a2 2 0 012-2h2.586l2 2H12a2 2 0 012 2v5a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 8v4M6 10h4" />
          </svg>
          New Folder
        </ToolbarBtn>

        <ToolbarBtn onClick={onNewFile} disabled={busy} title="New file">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6M9 2l4 4M9 2v4h4" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9h4M8 7v4" />
          </svg>
          New File
        </ToolbarBtn>

        {onSync && (
          <ToolbarBtn onClick={onSync} disabled={busy} title="Sync local folder → current remote path">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2 8a6 6 0 0110.5-3.9M14 8a6 6 0 01-10.5 3.9" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4l2.5 0.1L14 7M4 12L1.5 11.9 2 9" />
            </svg>
            Sync Folder
          </ToolbarBtn>
        )}
      </div>

      {/* Path display */}
      <div className="flex items-center px-3 py-1 border-t border-stroke-subtle gap-3 min-w-0">
        {busy && (
          <svg className="w-3 h-3 animate-spin text-accent-fg shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
        <span className="font-mono text-xs text-secondary truncate flex-1 min-w-0">{currentPath}</span>
        {syncProgress ? (
          <span className="text-xs text-accent-fg shrink-0">{syncProgress}</span>
        ) : hasClipboard ? (
          <span className="text-xs text-accent-fg shrink-0">● clipboard ready</span>
        ) : null}
        {editingCount > 0 && (
          <span className="text-xs text-amber-400 shrink-0 flex items-center gap-1">
            <span className="animate-pulse">●</span>
            Watching {editingCount} file{editingCount > 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}
