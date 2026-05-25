import { useRef, useState, useEffect, useMemo } from "react";
import { List, type RowComponentProps } from "react-window";
import { AutoSizer } from "react-virtualized-auto-sizer";
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
  hasClipboard: boolean;
  onSort: (key: SortKey) => void;
  onSelect: (path: string, meta: boolean, shift: boolean) => void;
  onNavigate: (entry: FileEntry) => void;
  onRenameChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onRenameStart: (path: string) => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onEdit?: (path: string) => void;
  onChmod?: (path: string, currentMode: number) => void;
}

interface ContextMenu { x: number; y: number; entry: FileEntry }

interface DblClickState { path: string; t: number }

interface RowData {
  entries: FileEntry[];
  selectedSet: Set<string>;
  renaming: string | null;
  renameValue: string;
  dblClickRef: React.MutableRefObject<DblClickState>;
  onSelect: (path: string, meta: boolean, shift: boolean) => void;
  onNavigate: (entry: FileEntry) => void;
  onRenameStart: (path: string) => void;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onEdit?: (path: string) => void;
  onChmod?: (path: string, mode: number) => void;
  hasClipboard: boolean;
  onContextMenu: (entry: FileEntry, e: React.MouseEvent) => void;
}

/** Format a Unix permission integer as a 9-character string, e.g. `rwxr-xr-x`. */
function formatPermissions(perm: number): string {
  return [
    perm & 0o400 ? "r" : "-", perm & 0o200 ? "w" : "-", perm & 0o100 ? "x" : "-",
    perm & 0o040 ? "r" : "-", perm & 0o020 ? "w" : "-", perm & 0o010 ? "x" : "-",
    perm & 0o004 ? "r" : "-", perm & 0o002 ? "w" : "-", perm & 0o001 ? "x" : "-",
  ].join("");
}

export function FileIcon({ isDir }: { isDir: boolean }) {
  if (isDir) {
    return (
      <svg className="w-4 h-4 text-accent-fg shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 text-faint shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
    </svg>
  );
}

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="opacity-0 ml-1">↑</span>;
  return <span className="ml-1 text-accent-fg">{dir === "asc" ? "↑" : "↓"}</span>;
}

function ColHeader({ label, colKey, sortKey, sortDir, align = "left", className = "px-2", onSort }: {
  label: string; colKey: SortKey; sortKey: SortKey; sortDir: SortDir;
  align?: "left" | "right"; className?: string; onSort: (k: SortKey) => void;
}) {
  const active = sortKey === colKey;
  return (
    <div className={`${className} py-2 font-medium text-xs uppercase tracking-wider text-${align}`}>
      <button
        onClick={() => onSort(colKey)}
        className={`flex items-center gap-0.5 transition-colors ${align === "right" ? "ml-auto" : ""} ${active ? "text-white" : "text-faint hover:text-muted"}`}
      >
        {label}
        <SortIndicator active={active} dir={sortDir} />
      </button>
    </div>
  );
}

export function MenuItem({ onClick, danger, disabled, children }: {
  onClick: () => void; danger?: boolean; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-3 py-1.5 text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        danger ? "text-red-400 hover:bg-red-950/40" : "text-secondary hover:bg-surface-4 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

export function ContextMenuPopup({ x, y, onClose, children }: {
  x: number; y: number; onClose: () => void; children: React.ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent && menuRef.current?.contains(e.target as Node)) return;
      onCloseRef.current();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <div
      ref={menuRef}
      style={{ left: x, top: y }}
      className="fixed z-50 bg-surface-2 border border-stroke rounded-lg shadow-2xl py-1 min-w-[160px]"
    >
      {children}
    </div>
  );
}

const GRID_COLS = "1fr 5rem 7rem 6rem";

// NOTE: defined outside SftpFileList so it doesn't get recreated on every render.
const Row = ({ index, style, entries, selectedSet, renaming, renameValue, dblClickRef, onSelect, onNavigate, onRenameStart, onRenameChange, onRenameCommit, onRenameCancel, onChmod, onContextMenu }: RowComponentProps<RowData>) => {
  const entry = entries[index];
  const isSelected = selectedSet.has(entry.path);
  const isRenaming = renaming === entry.path;

  const handleClick = (e: React.MouseEvent) => {
    const now = Date.now();
    const last = dblClickRef.current;
    if (!e.shiftKey && !e.metaKey && !e.ctrlKey && last.path === entry.path && now - last.t < 400) {
      dblClickRef.current = { path: "", t: 0 };
      if (entry.isDir) onNavigate(entry);
      else onRenameStart(entry.path);
    } else {
      dblClickRef.current = { path: entry.path, t: now };
      onSelect(entry.path, e.metaKey || e.ctrlKey, e.shiftKey);
    }
  };

  return (
    <div
      style={{ ...style, gridTemplateColumns: GRID_COLS }}
      onClick={handleClick}
      onContextMenu={(e) => onContextMenu(entry, e)}
      className={`grid cursor-pointer border-b border-stroke-subtle transition-colors select-none ${
        isSelected ? "bg-accent/10 text-accent-fg" : "text-secondary hover:bg-surface-2 hover:text-white"
      }`}
    >
      {/* Name cell */}
      <div className="px-2 flex items-center gap-2 min-w-0">
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
          <span className="truncate font-mono text-xs" title={entry.name}>{entry.name}</span>
        )}
        {entry.isSymlink && (
          <span className="text-xs text-accent-fg opacity-70 shrink-0 font-mono" title="Symbolic link">@</span>
        )}
      </div>

      {/* Size cell */}
      <div className="px-2 flex items-center justify-end text-faint font-mono text-xs tabular-nums">
        {formatSize(entry.size, entry.isDir)}
      </div>

      {/* Modified cell */}
      <div className="px-2 flex items-center justify-end text-faint text-xs">
        {formatDate(entry.modified)}
      </div>

      {/* Permissions cell */}
      <div className="pl-2 pr-4 flex items-center justify-end">
        {entry.permissions != null ? (
          <button
            onClick={(e) => { e.stopPropagation(); onChmod?.(entry.path, entry.permissions ?? 0o644); }}
            className="font-mono text-xs text-faint hover:text-accent-fg transition-colors disabled:pointer-events-none"
            title="Click to change permissions"
            disabled={!onChmod}
          >
            {formatPermissions(entry.permissions)}
          </button>
        ) : (
          <span className="font-mono text-xs text-dim">—</span>
        )}
      </div>
    </div>
  );
};

export default function SftpFileList({
  entries, selected, renaming, renameValue, sortKey, sortDir, hasClipboard,
  onSort, onSelect, onNavigate,
  onRenameChange, onRenameCommit, onRenameCancel, onRenameStart,
  onCut, onCopy, onPaste, onDelete, onEdit, onChmod,
}: Props) {
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const closeMenu = () => setContextMenu(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const dblClickRef = useRef<DblClickState>({ path: "", t: 0 });

  const handleContextMenu = (entry: FileEntry, e: React.MouseEvent) => {
    e.preventDefault();
    if (!selectedSet.has(entry.path)) onSelect(entry.path, false, false);
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 220);
    setContextMenu({ x, y, entry });
  };

  const rowData = useMemo<RowData>(() => ({
    entries,
    selectedSet,
    renaming,
    renameValue,
    dblClickRef,
    onSelect,
    onNavigate,
    onRenameStart,
    onRenameChange,
    onRenameCommit,
    onRenameCancel,
    onCut,
    onCopy,
    onPaste,
    onDelete,
    onEdit,
    onChmod,
    hasClipboard,
    onContextMenu: handleContextMenu,
  // NOTE: handleContextMenu closes over selectedSet and onSelect, both stable within this render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [
    entries, selectedSet, renaming, renameValue,
    onSelect, onNavigate, onRenameStart, onRenameChange, onRenameCommit, onRenameCancel,
    onCut, onCopy, onPaste, onDelete, onEdit, onChmod, hasClipboard,
  ]);

  const cm = contextMenu;
  const selCount = selected.length;
  const canRename = selCount === 1;
  const canEdit = selCount === 1 && cm && !cm.entry.isDir;
  const hasPerms = cm?.entry.permissions != null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Column header — always visible, outside the virtual list */}
      {entries.length > 0 && (
        <div
          className="grid sticky top-0 z-10 bg-surface-1 border-b border-stroke-subtle shrink-0"
          style={{ gridTemplateColumns: GRID_COLS }}
        >
          <ColHeader label="Name"     colKey="name"     sortKey={sortKey} sortDir={sortDir} className="px-2" onSort={onSort} />
          <ColHeader label="Size"     colKey="size"     sortKey={sortKey} sortDir={sortDir} align="right" className="px-2" onSort={onSort} />
          <ColHeader label="Modified" colKey="modified" sortKey={sortKey} sortDir={sortDir} align="right" className="px-2" onSort={onSort} />
          <div className="pl-2 pr-4 py-2 font-medium text-xs tracking-wider text-right">
            <span className="text-faint">Permissions</span>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 relative">
        {entries.length === 0 && (
          <div className="flex items-center justify-center h-full text-dim text-sm">Empty directory</div>
        )}

        {entries.length > 0 && (
          <AutoSizer
            renderProp={({ height, width }) => (
              <List
                style={{ height: height ?? 0, width: width ?? 0 }}
                rowCount={entries.length}
                rowHeight={36}
                rowComponent={Row}
                rowProps={rowData}
              />
            )}
          />
        )}
      </div>

      {/* Context menu — fixed-position, safe outside the virtual list */}
      {cm && (
        <ContextMenuPopup x={cm.x} y={cm.y} onClose={closeMenu}>
          <MenuItem onClick={() => { onCopy(); closeMenu(); }} disabled={selCount === 0}>
            Copy{selCount > 1 ? ` (${selCount})` : ""}
          </MenuItem>
          <MenuItem onClick={() => { onCut(); closeMenu(); }} disabled={selCount === 0}>
            Cut{selCount > 1 ? ` (${selCount})` : ""}
          </MenuItem>
          <MenuItem onClick={() => { onPaste(); closeMenu(); }} disabled={!hasClipboard}>
            Paste here
          </MenuItem>

          <div className="my-1 border-t border-stroke-subtle" />

          <MenuItem onClick={() => { if (cm) onRenameStart(cm.entry.path); closeMenu(); }} disabled={!canRename}>
            Rename
          </MenuItem>
          <MenuItem onClick={() => { onDelete(); closeMenu(); }} disabled={selCount === 0} danger>
            Delete{selCount > 1 ? ` (${selCount})` : ""}
          </MenuItem>

          {(onEdit || (onChmod && hasPerms)) && (
            <div className="my-1 border-t border-stroke-subtle" />
          )}

          {onEdit && (
            <MenuItem onClick={() => { if (cm) onEdit(cm.entry.path); closeMenu(); }} disabled={!canEdit}>
              Edit in default app
            </MenuItem>
          )}

          {onChmod && hasPerms && (
            <MenuItem onClick={() => { if (cm) onChmod(cm.entry.path, cm.entry.permissions ?? 0o644); closeMenu(); }}>
              Permissions…
            </MenuItem>
          )}
        </ContextMenuPopup>
      )}
    </div>
  );
}
