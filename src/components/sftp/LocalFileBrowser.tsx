import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { List, type RowComponentProps } from "react-window";
import { AutoSizer } from "react-virtualized-auto-sizer";
import type { LocalFileEntry } from "../../types/local";
import { localCommands } from "../../lib/tauriCommands";
import { formatSize, formatDate } from "../../lib/format";
import { formatError } from "../../lib/errors";
import { PathBar } from "./SftpToolbar";
import { FileIcon, MenuItem, ContextMenuPopup } from "./SftpFileList";
import DeleteConfirmBanner from "./DeleteConfirmBanner";
import ErrorBanner from "./ErrorBanner";
import InlineCreateInput from "./InlineCreateInput";
import { joinPath, parentPath } from "../../lib/path";

interface Props {
  onSelectedChange: (paths: string[]) => void;
  onPathChange: (path: string) => void;
  onActivate: () => void;
  showHidden?: boolean;
  newFolderTrigger?: number;
  newFileTrigger?: number;
}

interface ContextMenu { x: number; y: number; entry: LocalFileEntry }

interface LocalRowData {
  entries: LocalFileEntry[];
  selectedSet: Set<string>;
  renaming: string | null;
  renameValue: string;
  onRowClick: (entry: LocalFileEntry, e: React.MouseEvent) => void;
  onContextMenu: (entry: LocalFileEntry, e: React.MouseEvent) => void;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
}

const GRID_COLS = "1fr 5rem 7rem";

// NOTE: defined outside LocalFileBrowser so it doesn't get recreated on every render.
const Row = ({ index, style, entries, selectedSet, renaming, renameValue, onRowClick, onContextMenu, onRenameChange, onRenameCommit, onRenameCancel }: RowComponentProps<LocalRowData>) => {
  const entry = entries[index];
  const isSelected = selectedSet.has(entry.path);
  const isRenaming = renaming === entry.path;

  return (
    <div
      style={{ ...style, gridTemplateColumns: GRID_COLS }}
      onClick={(e) => onRowClick(entry, e)}
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
      </div>

      {/* Size cell */}
      <div className="px-2 flex items-center justify-end text-faint font-mono text-xs tabular-nums">
        {formatSize(entry.size, entry.isDir)}
      </div>

      {/* Modified cell */}
      <div className="px-2 flex items-center justify-end text-faint text-xs">
        {formatDate(entry.modified)}
      </div>
    </div>
  );
};

export default function LocalFileBrowser({ onSelectedChange, onPathChange, onActivate, showHidden = true, newFolderTrigger = 0, newFileTrigger = 0 }: Props) {
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<LocalFileEntry[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [lastClickedPath, setLastClickedPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creatingFile, setCreatingFile] = useState(false);
  const initialised = useRef(false);

  const navigateTo = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    setSelected([]);
    setRenaming(null);
    try {
      const result = await localCommands.listLocalDir(path);
      setEntries(result);
      setCurrentPath(path);
      onPathChange(path);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, [onPathChange]);

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    localCommands.getLocalHomeDir()
      .then((home) => navigateTo(home))
      .catch((e) => { setError(formatError(e)); setLoading(false); });
  }, [navigateTo]);

  useEffect(() => {
    onSelectedChange(selected);
  }, [selected, onSelectedChange]);

  useEffect(() => {
    if (newFolderTrigger === 0) return;
    setCreatingFolder(true);
  }, [newFolderTrigger]);

  useEffect(() => {
    if (newFileTrigger === 0) return;
    setCreatingFile(true);
  }, [newFileTrigger]);

  const commitNewFolder = async (name: string) => {
    if (!name) { setCreatingFolder(false); return; }
    setError(null);
    try {
      await localCommands.createLocalDir(joinPath(currentPath, name));
      setCreatingFolder(false);
      await navigateTo(currentPath);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const commitNewFile = async (name: string) => {
    if (!name) { setCreatingFile(false); return; }
    setError(null);
    try {
      await localCommands.createLocalFile(joinPath(currentPath, name));
      setCreatingFile(false);
      await navigateTo(currentPath);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleUp = () => {
    void navigateTo(parentPath(currentPath));
  };

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const visibleEntries = showHidden ? entries : entries.filter((e) => !e.name.startsWith("."));
  const dblClickRef = useRef<{ path: string; t: number }>({ path: "", t: 0 });

  const commitRename = useCallback(async () => {
    if (!renaming || !renameValue.trim()) { setRenaming(null); return; }
    const dir = renaming.split("/").slice(0, -1).join("/");
    const newPath = `${dir}/${renameValue.trim()}`;
    if (newPath === renaming) { setRenaming(null); return; }
    setError(null);
    try {
      await localCommands.renameLocal(renaming, newPath);
      setRenaming(null);
      setSelected([]);
      await navigateTo(currentPath);
    } catch (e) {
      setError(formatError(e));
      setRenaming(null);
    }
  }, [renaming, renameValue, currentPath, navigateTo]);

  const commitDelete = async () => {
    setConfirmingDelete(false);
    setError(null);
    let failed = 0;
    for (const path of selected) {
      try {
        await localCommands.deleteLocal(path);
      } catch {
        failed++;
      }
    }
    if (failed > 0) setError(`${failed} item(s) could not be deleted.`);
    setSelected([]);
    await navigateTo(currentPath);
  };

  const handleRowClick = useCallback((entry: LocalFileEntry, e: React.MouseEvent) => {
    onActivate();
    const now = Date.now();
    const last = dblClickRef.current;
    if (!e.shiftKey && !e.metaKey && !e.ctrlKey && last.path === entry.path && now - last.t < 400) {
      dblClickRef.current = { path: "", t: 0 };
      if (entry.isDir) {
        void navigateTo(entry.path);
      } else {
        setRenaming(entry.path);
        setRenameValue(entry.name);
        setSelected([entry.path]);
      }
      return;
    }
    dblClickRef.current = { path: entry.path, t: now };
    const allPaths = visibleEntries.map((en) => en.path);
    if (e.shiftKey && lastClickedPath) {
      const from = allPaths.indexOf(lastClickedPath);
      const to = allPaths.indexOf(entry.path);
      if (from !== -1 && to !== -1) {
        const [start, end] = from <= to ? [from, to] : [to, from];
        const range = allPaths.slice(start, end + 1);
        setSelected((prev) => [...new Set([...prev, ...range])]);
        return;
      }
    }
    if (e.metaKey || e.ctrlKey) {
      setSelected((prev) =>
        selectedSet.has(entry.path) ? prev.filter((p) => p !== entry.path) : [...prev, entry.path],
      );
    } else {
      setSelected([entry.path]);
    }
    setLastClickedPath(entry.path);
  }, [onActivate, navigateTo, visibleEntries, lastClickedPath, selectedSet]);

  const handleContextMenu = useCallback((entry: LocalFileEntry, e: React.MouseEvent) => {
    e.preventDefault();
    onActivate();
    if (!selectedSet.has(entry.path)) {
      setSelected([entry.path]);
      setLastClickedPath(entry.path);
    }
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 200);
    setContextMenu({ x, y, entry });
  }, [onActivate, selectedSet]);

  const closeMenu = () => setContextMenu(null);

  const rowData = useMemo<LocalRowData>(() => ({
    entries: visibleEntries,
    selectedSet,
    renaming,
    renameValue,
    onRowClick: handleRowClick,
    onContextMenu: handleContextMenu,
    onRenameChange: setRenameValue,
    onRenameCommit: () => { void commitRename(); },
    onRenameCancel: () => setRenaming(null),
  }), [visibleEntries, selectedSet, renaming, renameValue, handleRowClick, handleContextMenu, commitRename]);

  const cm = contextMenu;
  const selCount = selected.length;

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* Pane header */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-stroke-subtle bg-surface-1 shrink-0">
        <button
          onClick={handleUp}
          disabled={currentPath === "/" || loading}
          className="p-1 rounded text-muted hover:text-white hover:bg-surface-3 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Go up"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
        </button>
        <PathBar path={currentPath} busy={loading} onNavigateTo={(p) => { void navigateTo(p); }} />
        <button
          onClick={() => { void navigateTo(currentPath); }}
          disabled={loading}
          className="p-1 rounded text-muted hover:text-white hover:bg-surface-3 transition-colors disabled:opacity-30"
          title="Refresh"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Delete confirmation */}
      {confirmingDelete && (
        <DeleteConfirmBanner count={selCount} onConfirm={() => { void commitDelete(); }} onCancel={() => setConfirmingDelete(false)} />
      )}

      {/* Error banner */}
      {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}

      {/* New folder input */}
      {creatingFolder && <InlineCreateInput label="New folder:" placeholder="folder-name" onCommit={(v) => { void commitNewFolder(v); }} onCancel={() => setCreatingFolder(false)} />}

      {/* New file input */}
      {creatingFile && <InlineCreateInput label="New file:" placeholder="filename.txt" onCommit={(v) => { void commitNewFile(v); }} onCancel={() => setCreatingFile(false)} />}

      {/* File list */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Column header — always visible, outside the virtual list */}
        {visibleEntries.length > 0 && (
          <div
            className="grid sticky top-0 z-10 bg-surface-1 border-b border-stroke-subtle shrink-0"
            style={{ gridTemplateColumns: GRID_COLS }}
          >
            <div className="px-2 py-2 font-medium text-xs uppercase tracking-wider text-left text-faint">Name</div>
            <div className="px-2 py-2 font-medium text-xs uppercase tracking-wider text-right text-faint">Size</div>
            <div className="px-2 py-2 font-medium text-xs uppercase tracking-wider text-right text-faint">Modified</div>
          </div>
        )}

        <div className="flex-1 min-h-0 relative">
          {!error && visibleEntries.length === 0 && !loading && (
            <div className="flex items-center justify-center h-full text-dim text-sm">
              Empty directory
            </div>
          )}

          {visibleEntries.length > 0 && (
            <AutoSizer
              renderProp={({ height, width }) => (
                <List
                  style={{ height: height ?? 0, width: width ?? 0 }}
                  rowCount={visibleEntries.length}
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
            <MenuItem
              onClick={() => { void localCommands.openLocal(cm.entry.path); closeMenu(); }}
              disabled={cm.entry.isDir}
            >
              Open
            </MenuItem>
            <MenuItem onClick={() => { void localCommands.revealInFinder(cm.entry.path); closeMenu(); }}>
              Reveal in Finder
            </MenuItem>

            <div className="my-1 border-t border-stroke-subtle" />

            <MenuItem
              onClick={() => {
                setRenaming(cm.entry.path);
                setRenameValue(cm.entry.name);
                setSelected([cm.entry.path]);
                closeMenu();
              }}
              disabled={selCount !== 1}
            >
              Rename
            </MenuItem>
            <MenuItem
              onClick={() => { setConfirmingDelete(true); closeMenu(); }}
              disabled={selCount === 0}
              danger
            >
              Delete{selCount > 1 ? ` (${selCount})` : ""}
            </MenuItem>
          </ContextMenuPopup>
        )}
      </div>
    </div>
  );
}
