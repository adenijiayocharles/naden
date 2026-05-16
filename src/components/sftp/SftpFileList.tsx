import { useRef } from "react";
import type { FileEntry } from "../../types/sftp";
import { formatSize, formatDate } from "../../lib/format";

export type SortKey = "name" | "size" | "modified";
export type SortDir = "asc" | "desc";

interface Props {
  entries: FileEntry[];
  selected: string[];
  renaming: string | null;
  renameValue: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  onSelect: (path: string, meta: boolean, shift: boolean) => void;
  onNavigate: (entry: FileEntry) => void;
  onRenameChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onRenameStart: (path: string) => void;
  onChmod?: (path: string, currentMode: number) => void;
}

/** Format a Unix permission integer as a 9-character string, e.g. `rwxr-xr-x`. */
function formatPermissions(perm: number): string {
  const bits = [
    perm & 0o400 ? "r" : "-",
    perm & 0o200 ? "w" : "-",
    perm & 0o100 ? "x" : "-",
    perm & 0o040 ? "r" : "-",
    perm & 0o020 ? "w" : "-",
    perm & 0o010 ? "x" : "-",
    perm & 0o004 ? "r" : "-",
    perm & 0o002 ? "w" : "-",
    perm & 0o001 ? "x" : "-",
  ];
  return bits.join("");
}

function FileIcon({ isDir }: { isDir: boolean }) {
  if (isDir) {
    return (
      <svg className="w-4 h-4 text-accent-fg shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 text-faint shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="opacity-0 ml-1">↑</span>;
  return <span className="ml-1 text-accent-fg">{dir === "asc" ? "↑" : "↓"}</span>;
}

function ColHeader({
  label, colKey, sortKey, sortDir, align = "left", onSort,
}: {
  label: string; colKey: SortKey; sortKey: SortKey; sortDir: SortDir;
  align?: "left" | "right"; onSort: (k: SortKey) => void;
}) {
  const active = sortKey === colKey;
  return (
    <th className={`px-4 py-2 font-medium text-xs uppercase tracking-wider text-${align}`}>
      <button
        onClick={() => onSort(colKey)}
        className={`flex items-center gap-0.5 transition-colors ${
          align === "right" ? "ml-auto" : ""
        } ${active ? "text-white" : "text-faint hover:text-muted"}`}
      >
        {label}
        <SortIndicator active={active} dir={sortDir} />
      </button>
    </th>
  );
}

export default function SftpFileList({
  entries,
  selected,
  renaming,
  renameValue,
  sortKey,
  sortDir,
  onSort,
  onSelect,
  onNavigate,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onRenameStart,
  onChmod,
}: Props) {
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-dim text-sm">
        Empty directory
      </div>
    );
  }

  const handleRowClick = (entry: FileEntry, e: React.MouseEvent) => {
    onSelect(entry.path, e.metaKey || e.ctrlKey, e.shiftKey);
  };

  const handleRowDoubleClick = (entry: FileEntry) => {
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null; }
    if (entry.isDir) onNavigate(entry);
    else onRenameStart(entry.path);
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-surface-0 z-10 border-b border-stroke-subtle">
          <tr>
            <ColHeader label="Name"     colKey="name"     sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <ColHeader label="Size"     colKey="size"     sortKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
            <ColHeader label="Modified" colKey="modified" sortKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
            <th className="px-4 py-2 font-medium text-xs uppercase tracking-wider text-right">
              <span className="text-faint">Permissions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const isSelected = selected.includes(entry.path);
            const isRenaming = renaming === entry.path;

            return (
              <tr
                key={entry.path}
                onClick={(e) => handleRowClick(entry, e)}
                onDoubleClick={() => handleRowDoubleClick(entry)}
                className={`cursor-pointer border-b border-stroke-subtle transition-colors select-none ${
                  isSelected
                    ? "bg-accent/10 text-accent-fg"
                    : "text-secondary hover:bg-surface-2 hover:text-white"
                }`}
              >
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <FileIcon isDir={entry.isDir} />
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => onRenameChange(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") onRenameCommit();
                          if (e.key === "Escape") onRenameCancel();
                        }}
                        onBlur={onRenameCommit}
                        className="flex-1 h-6 bg-surface-3 border border-accent rounded px-1.5 text-xs text-white outline-none font-mono min-w-0"
                      />
                    ) : (
                      <span className="truncate font-mono text-xs" title={entry.name}>
                        {entry.name}
                      </span>
                    )}
                    {entry.isSymlink && (
                      <span
                        className="text-xs text-accent-fg opacity-70 shrink-0 font-mono"
                        title="Symbolic link"
                      >
                        @
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2 text-right text-faint font-mono text-xs tabular-nums">
                  {formatSize(entry.size, entry.isDir)}
                </td>
                <td className="px-4 py-2 text-right text-faint text-xs">
                  {formatDate(entry.modified)}
                </td>
                <td className="px-4 py-2 text-right">
                  {entry.permissions != null ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onChmod?.(entry.path, entry.permissions ?? 0o644);
                      }}
                      className="font-mono text-xs text-faint hover:text-accent-fg transition-colors disabled:pointer-events-none"
                      title="Click to change permissions"
                      disabled={!onChmod}
                    >
                      {formatPermissions(entry.permissions)}
                    </button>
                  ) : (
                    <span className="font-mono text-xs text-dim">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
