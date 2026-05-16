interface Props {
  currentPath: string;
  selectedCount: number;
  selectedHasDir: boolean;
  hasClipboard: boolean;
  busy: boolean;
  onNavigateTo: (path: string) => void;
  onNavigateUp: () => void;
  onRefresh: () => void;
  onUpload: () => void;
  onDownload: () => void;
  onNewFolder: () => void;
  onNewFile: () => void;
  onDelete: () => void;
  onRename: () => void;
  onCut: () => void;
  onPaste: () => void;
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

function PathBreadcrumb({ path, busy, onNavigateTo }: { path: string; busy: boolean; onNavigateTo: (p: string) => void }) {
  const segments = path.split("/").filter(Boolean);
  const MAX_VISIBLE = 3;
  const truncated = segments.length > MAX_VISIBLE;
  const visible = truncated ? segments.slice(-MAX_VISIBLE) : segments;
  const hiddenDepth = segments.length - visible.length;

  return (
    <div className="flex items-center gap-0.5 min-w-0 font-mono text-xs overflow-hidden">
      {busy && (
        <svg className="w-3 h-3 animate-spin text-accent-fg shrink-0 mr-1" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      <button
        onClick={() => onNavigateTo("/")}
        disabled={busy}
        className="text-faint hover:text-white disabled:pointer-events-none transition-colors shrink-0"
      >
        /
      </button>
      {truncated && (
        <>
          <button
            onClick={() => onNavigateTo("/" + segments.slice(0, hiddenDepth).join("/"))}
            disabled={busy}
            className="text-faint hover:text-white disabled:pointer-events-none transition-colors shrink-0 px-0.5"
            title={`/${segments.slice(0, hiddenDepth).join("/")}`}
          >
            …
          </button>
          <span className="text-dim shrink-0">/</span>
        </>
      )}
      {visible.map((seg, i) => {
        const segPath = "/" + segments.slice(0, hiddenDepth + i + 1).join("/");
        const isLast = i === visible.length - 1;
        return (
          <span key={segPath} className="flex items-center gap-0.5 min-w-0">
            <button
              onClick={() => onNavigateTo(segPath)}
              disabled={busy || isLast}
              className={`truncate transition-colors disabled:pointer-events-none ${
                isLast ? "text-secondary" : "text-faint hover:text-white"
              }`}
            >
              {seg}
            </button>
            {!isLast && <span className="text-dim shrink-0">/</span>}
          </span>
        );
      })}
    </div>
  );
}

export default function SftpToolbar({
  currentPath,
  selectedCount,
  selectedHasDir,
  hasClipboard,
  busy,
  onNavigateTo,
  onNavigateUp,
  onRefresh,
  onUpload,
  onDownload,
  onNewFolder,
  onNewFile,
  onDelete,
  onRename,
  onCut,
  onPaste,
}: Props) {
  const hasSelection = selectedCount > 0;
  const canDownload = hasSelection && !selectedHasDir;
  const canRename = selectedCount === 1;

  return (
    <div className="flex flex-col shrink-0 bg-surface-0 border-b border-stroke-subtle">
      <div className="h-10 flex items-center gap-1 px-2">
        <ToolbarBtn onClick={onNavigateUp} disabled={busy || currentPath === "/"} title="Up">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12V4M4 8l4-4 4 4" />
          </svg>
          Up
        </ToolbarBtn>

        <ToolbarBtn onClick={onRefresh} disabled={busy} title="Refresh">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 8A5 5 0 113 8" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 4v4h-4" />
          </svg>
          Refresh
        </ToolbarBtn>

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

        <div className="w-px h-4 bg-surface-4 mx-1" />

        <ToolbarBtn onClick={onCut} disabled={busy || !hasSelection} title="Cut selected (move)">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
            <circle cx="4" cy="12" r="2" />
            <circle cx="4" cy="4" r="2" />
            <path strokeLinecap="round" d="M6 4l8 4M6 12l8-4" />
          </svg>
          Cut{selectedCount > 0 ? ` (${selectedCount})` : ""}
        </ToolbarBtn>

        <ToolbarBtn onClick={onPaste} disabled={busy || !hasClipboard} title="Paste (move here)">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
            <rect x="2" y="4" width="10" height="11" rx="1" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1" />
          </svg>
          Paste
        </ToolbarBtn>

        <div className="w-px h-4 bg-surface-4 mx-1" />

        <ToolbarBtn onClick={onRename} disabled={busy || !canRename} title="Rename (or double-click)">
          Rename
        </ToolbarBtn>

        <ToolbarBtn onClick={onDelete} disabled={busy || !hasSelection} title="Delete selected">
          <span className="text-red-400">Delete{selectedCount > 1 ? ` (${selectedCount})` : ""}</span>
        </ToolbarBtn>
      </div>

      <div className="flex items-center px-3 py-1 border-t border-stroke-subtle gap-3">
        <PathBreadcrumb path={currentPath} busy={busy} onNavigateTo={onNavigateTo} />
        {hasClipboard && (
          <span className="text-xs text-accent-fg shrink-0">● clipboard ready</span>
        )}
      </div>
    </div>
  );
}
