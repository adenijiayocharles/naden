interface Props {
  currentPath: string;
  selectedPath: string | null;
  selectedIsDir: boolean;
  busy: boolean;
  onNavigateTo: (path: string) => void;
  onNavigateUp: () => void;
  onRefresh: () => void;
  onUpload: () => void;
  onDownload: () => void;
  onNewFolder: () => void;
  onDelete: () => void;
  onRename: () => void;
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
      className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-[#aaa] hover:text-white hover:bg-[#222] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}

function PathBreadcrumb({ path, busy, onNavigateTo }: { path: string; busy: boolean; onNavigateTo: (p: string) => void }) {
  const segments = path.split("/").filter(Boolean);

  return (
    <div className="flex items-center gap-0.5 min-w-0 font-mono text-xs overflow-hidden">
      {busy && (
        <svg className="w-3 h-3 animate-spin text-accent shrink-0 mr-1" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      <button
        onClick={() => onNavigateTo("/")}
        disabled={busy}
        className="text-[#666] hover:text-white disabled:pointer-events-none transition-colors shrink-0"
      >
        /
      </button>
      {segments.map((seg, i) => {
        const segPath = "/" + segments.slice(0, i + 1).join("/");
        const isLast = i === segments.length - 1;
        return (
          <span key={segPath} className="flex items-center gap-0.5 min-w-0">
            <button
              onClick={() => onNavigateTo(segPath)}
              disabled={busy || isLast}
              className={`truncate transition-colors disabled:pointer-events-none ${
                isLast ? "text-[#ccc]" : "text-[#666] hover:text-white"
              }`}
            >
              {seg}
            </button>
            {!isLast && <span className="text-[#444] shrink-0">/</span>}
          </span>
        );
      })}
    </div>
  );
}

export default function SftpToolbar({
  currentPath,
  selectedPath,
  selectedIsDir,
  busy,
  onNavigateTo,
  onNavigateUp,
  onRefresh,
  onUpload,
  onDownload,
  onNewFolder,
  onDelete,
  onRename,
}: Props) {
  const hasSelection = Boolean(selectedPath);
  const canDownload = hasSelection && !selectedIsDir;

  return (
    <div className="flex flex-col shrink-0 bg-[#0d0d0d] border-b border-[#1e1e1e]">
      {/* Action buttons row */}
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

        <div className="w-px h-4 bg-[#222] mx-1" />

        <ToolbarBtn onClick={onUpload} disabled={busy} title="Upload file">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10V3M5 6l3-3 3 3M3 12h10" />
          </svg>
          Upload
        </ToolbarBtn>

        <ToolbarBtn onClick={onDownload} disabled={busy || !canDownload} title="Download selected file">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v7M5 7l3 3 3-3M3 12h10" />
          </svg>
          Download
        </ToolbarBtn>

        <ToolbarBtn onClick={onNewFolder} disabled={busy} title="New folder">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2 5a2 2 0 012-2h2.586l2 2H12a2 2 0 012 2v5a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 8v4M6 10h4" />
          </svg>
          New Folder
        </ToolbarBtn>

        <div className="w-px h-4 bg-[#222] mx-1" />

        <ToolbarBtn onClick={onRename} disabled={busy || !hasSelection} title="Rename selected">
          Rename
        </ToolbarBtn>

        <ToolbarBtn onClick={onDelete} disabled={busy || !hasSelection} title="Delete selected">
          <span className="text-red-400">Delete</span>
        </ToolbarBtn>
      </div>

      {/* Path row */}
      <div className="flex items-center px-3 py-1 border-t border-[#161616]">
        <PathBreadcrumb path={currentPath} busy={busy} onNavigateTo={onNavigateTo} />
      </div>
    </div>
  );
}
