import { useRef, useState, useEffect, useMemo } from "react";
import { setDragImage } from "../../lib/dragImage";
import { List, type RowComponentProps, type ListImperativeAPI } from "react-window";
import { AutoSizer } from "react-virtualized-auto-sizer";
import type { FileEntry } from "../../types/sftp";
import { formatSize, formatDate } from "../../lib/format";
import { Input } from "../ui/input";

export type SortKey = "name" | "size" | "modified";
export type SortDir = "asc" | "desc";

interface Props {
  entries: FileEntry[];
  selected: string[];
  /** Path of the keyboard-navigation cursor (shift+arrow range end); scrolled into view when it changes. */
  scrollCursor?: string | null;
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
  onNewFolder: () => void;
  onEdit?: (path: string) => void;
  onChmod?: (path: string, currentMode: number) => void;
  onDragStart?: (paths: string[]) => void;
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
  onDragStart?: (paths: string[]) => void;
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

function ColHeader({ label, colKey, sortKey, sortDir, align = "left", className = "px-2", onSort, onResizeStart }: {
  label: string; colKey: SortKey; sortKey: SortKey; sortDir: SortDir;
  align?: "left" | "center" | "right"; className?: string; onSort: (k: SortKey) => void;
  onResizeStart?: (e: React.PointerEvent) => void;
}) {
  const active = sortKey === colKey;
  const justify = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "";
  return (
    <div className={`relative ${className} py-1 font-medium text-xs uppercase tracking-wider flex items-center ${justify}`}>
      <button
        onClick={() => onSort(colKey)}
        className={`flex items-center gap-0.5 transition-colors ${active ? "text-white" : "text-faint hover:text-muted"}`}
      >
        {label}
        <SortIndicator active={active} dir={sortDir} />
      </button>
      {onResizeStart && (
        <div
          className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize z-20 group"
          onPointerDown={onResizeStart}
        >
          <div className="absolute inset-y-1 left-1/2 -translate-x-1/2 w-px bg-stroke-subtle group-hover:bg-accent/60 transition-colors rounded-full" />
        </div>
      )}
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
      className={`w-full text-left px-3 py-1.5 text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
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
      className="fixed z-50 bg-surface-2 border border-stroke rounded-lg shadow-overlay py-1 min-w-[160px]"
    >
      {children}
    </div>
  );
}

// NOTE: defined outside SftpFileList so it doesn't get recreated on every render.
const Row = ({ index, style, entries, selectedSet, renaming, renameValue, dblClickRef, onSelect, onNavigate, onRenameStart, onRenameChange, onRenameCommit, onRenameCancel, onChmod, onContextMenu, onDragStart }: RowComponentProps<RowData>) => {
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

  const handleDragStart = (e: React.DragEvent) => {
    if (isRenaming) { e.preventDefault(); return; }
    const paths = selectedSet.has(entry.path) ? [...selectedSet] : [entry.path];
    e.dataTransfer.setData("application/x-remote-paths", JSON.stringify(paths));
    e.dataTransfer.effectAllowed = "copy";
    setDragImage(e, entry.name, paths.length);
    onDragStart?.(paths);
  };

  return (
    <div
      style={{ ...style, gridTemplateColumns: "var(--sftp-col)" }}
      draggable={!isRenaming}
      onClick={handleClick}
      onDragStart={handleDragStart}
      onContextMenu={(e) => onContextMenu(entry, e)}
      className={`grid cursor-pointer border-b border-stroke-subtle transition-colors select-none ${
        isSelected ? "bg-accent/10 text-accent-fg" : "text-secondary hover:bg-surface-2 hover:text-white"
      }`}
    >
      {/* Name cell */}
      <div className="px-2 flex items-center gap-2 min-w-0">
        <FileIcon isDir={entry.isDir} />
        {isRenaming ? (
          <Input
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
            className="flex-1 h-6 border-accent px-1.5 text-xs min-w-0"
          />
        ) : (
          <span className="truncate text-xs" title={entry.name}>{entry.name}</span>
        )}
        {entry.isSymlink && (
          <span className="text-xs text-accent-fg opacity-70 shrink-0" title="Symbolic link">@</span>
        )}
      </div>

      {/* Size cell */}
      <div className="px-2 flex items-center justify-center text-faint text-xs tabular-nums">
        {formatSize(entry.size, entry.isDir)}
      </div>

      {/* Modified cell */}
      <div className="px-2 flex items-center justify-center text-faint text-xs">
        {formatDate(entry.modified)}
      </div>

      {/* Permissions cell */}
      <div className="px-2 flex items-center justify-center">
        {entry.permissions != null ? (
          <button
            onClick={(e) => { e.stopPropagation(); onChmod?.(entry.path, entry.permissions ?? 0o644); }}
            className="text-xs text-faint hover:text-accent-fg transition-colors disabled:pointer-events-none"
            title="Click to change permissions"
            disabled={!onChmod}
          >
            {formatPermissions(entry.permissions)}
          </button>
        ) : (
          <span className="text-meta text-dim">—</span>
        )}
      </div>
    </div>
  );
};

export default function SftpFileList({
  entries, selected, scrollCursor, renaming, renameValue, sortKey, sortDir, hasClipboard,
  onSort, onSelect, onNavigate,
  onRenameChange, onRenameCommit, onRenameCancel, onRenameStart,
  onCut, onCopy, onPaste, onDelete, onNewFolder, onEdit, onChmod, onDragStart,
}: Props) {
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const closeMenu = () => setContextMenu(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const dblClickRef = useRef<DblClickState>({ path: "", t: 0 });
  const listRef = useRef<ListImperativeAPI>(null);

  useEffect(() => {
    if (!scrollCursor) return;
    const index = entries.findIndex((e) => e.path === scrollCursor);
    if (index !== -1) listRef.current?.scrollToRow({ index, align: "auto" });
  }, [scrollCursor, entries]);

  const [colFracs, setColFracs] = useState([2.0, 1.0, 1.5, 1.0]);
  const headerRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = (colIndex: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const containerWidth = headerRef.current?.offsetWidth ?? 0;
    if (containerWidth === 0) return;
    const startFracs = [...colFracs];
    const totalFr = startFracs.reduce((a, b) => a + b, 0);
    const col0 = startFracs[colIndex];
    const col1 = startFracs[colIndex + 1];
    const onMove = (me: PointerEvent) => {
      const deltaFr = ((me.clientX - startX) / containerWidth) * totalFr;
      const clamped = Math.max(0.3 - col0, Math.min(col1 - 0.3, deltaFr));
      const next = [...startFracs];
      next[colIndex] = col0 + clamped;
      next[colIndex + 1] = col1 - clamped;
      setColFracs(next);
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  const gridTemplateColumns = colFracs.map((f) => `${f}fr`).join(" ");

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
    onDragStart,
  // NOTE: handleContextMenu closes over selectedSet and onSelect, both stable within this render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [
    entries, selectedSet, renaming, renameValue,
    onSelect, onNavigate, onRenameStart, onRenameChange, onRenameCommit, onRenameCancel,
    onCut, onCopy, onPaste, onDelete, onEdit, onChmod, hasClipboard, onDragStart,
  ]);

  const cm = contextMenu;
  const selCount = selected.length;
  const canRename = selCount === 1;
  const canEdit = selCount === 1 && cm && !cm.entry.isDir;
  const hasPerms = cm?.entry.permissions != null;

  return (
    <div
      className="flex flex-col flex-1 min-h-0"
      style={{ "--sftp-col": gridTemplateColumns } as React.CSSProperties}
    >
      {/* Column header — always visible, outside the virtual list */}
      {entries.length > 0 && (
        <div
          ref={headerRef}
          className="grid sticky top-0 z-10 bg-surface-1 border-b border-stroke-subtle shrink-0"
          style={{ gridTemplateColumns: "var(--sftp-col)" }}
        >
          <ColHeader label="NAME"     colKey="name"     sortKey={sortKey} sortDir={sortDir} className="px-2" onSort={onSort} onResizeStart={handleResizeStart(0)} />
          <ColHeader label="SIZE"     colKey="size"     sortKey={sortKey} sortDir={sortDir} align="center" className="px-2" onSort={onSort} onResizeStart={handleResizeStart(1)} />
          <ColHeader label="MODIFIED" colKey="modified" sortKey={sortKey} sortDir={sortDir} align="center" className="px-2" onSort={onSort} onResizeStart={handleResizeStart(2)} />
          <div className="px-2 py-1 font-medium text-xs tracking-wider flex items-center justify-center">
            <span className="text-faint">PERMISSIONS</span>
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
                listRef={listRef}
                style={{ height: height ?? 0, width: width ?? 0 }}
                rowCount={entries.length}
                rowHeight={40}
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
          <MenuItem onClick={() => { onNewFolder(); closeMenu(); }}>
            New Folder
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
