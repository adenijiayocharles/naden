import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { List, type RowComponentProps, type ListImperativeAPI } from "react-window";
import { AutoSizer } from "react-virtualized-auto-sizer";
import type { LocalFileEntry } from "../../types/local";
import { localCommands } from "../../lib/tauriCommands";
import { formatSize, formatDate } from "../../lib/format";
import { formatError } from "../../lib/errors";
import { PathBar } from "./SftpToolbar";
import { FileIcon, MenuItem, ContextMenuPopup } from "./SftpFileList";
import ConfirmDeleteModal from "../shared/ConfirmDeleteModal";
import ErrorBanner from "./ErrorBanner";
import InlineCreateInput from "./InlineCreateInput";
import { joinPath, parentPath } from "../../lib/path";
import { arrowSelect } from "../../lib/rangeSelect";
import { setDragImage } from "../../lib/dragImage";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

interface Props {
  onSelectedChange: (paths: string[]) => void;
  onPathChange: (path: string) => void;
  onActivate: () => void;
  isActive: boolean;
  showHidden?: boolean;
  newFolderTrigger?: number;
  newFileTrigger?: number;
  refreshTrigger?: number;
  onDropRemotePaths?: (remotePaths: string[]) => void;
}

interface ContextMenu { x: number; y: number; entry: LocalFileEntry | null }

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
  onDragStart: (entry: LocalFileEntry, e: React.DragEvent) => void;
}

// NOTE: defined outside LocalFileBrowser so it doesn't get recreated on every render.
const Row = ({ index, style, entries, selectedSet, renaming, renameValue, onRowClick, onContextMenu, onRenameChange, onRenameCommit, onRenameCancel, onDragStart }: RowComponentProps<LocalRowData>) => {
  const entry = entries[index];
  const isSelected = selectedSet.has(entry.path);
  const isRenaming = renaming === entry.path;

  return (
    <div
      style={{ ...style, gridTemplateColumns: "var(--local-col)" }}
      draggable={!isRenaming}
      onClick={(e) => onRowClick(entry, e)}
      onDragStart={(e) => onDragStart(entry, e)}
      onContextMenu={(e) => { e.stopPropagation(); onContextMenu(entry, e); }}
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
      </div>

      {/* Size cell */}
      <div className="px-2 flex items-center justify-center text-faint text-xs tabular-nums">
        {formatSize(entry.size, entry.isDir)}
      </div>

      {/* Modified cell */}
      <div className="px-2 flex items-center justify-center text-faint text-xs">
        {formatDate(entry.modified)}
      </div>
    </div>
  );
};

export default function LocalFileBrowser({ onSelectedChange, onPathChange, onActivate, isActive, showHidden = true, newFolderTrigger = 0, newFileTrigger = 0, refreshTrigger = 0, onDropRemotePaths }: Props) {
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<LocalFileEntry[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [lastClickedPath, setLastClickedPath] = useState<string | null>(null);
  // Tracks the moving end of a shift+arrow range; the anchor (lastClickedPath) stays fixed.
  const [cursorPath, setCursorPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creatingFile, setCreatingFile] = useState(false);
  const [dropCount, setDropCount] = useState(0);
  const initialised = useRef(false);
  const listRef = useRef<ListImperativeAPI>(null);

  const navigateTo = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    setSelected([]);
    setCursorPath(null);
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

  useEffect(() => {
    if (refreshTrigger === 0) return;
    void navigateTo(currentPath);
  }, [refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps -- only re-run on refreshTrigger changes

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
  const visibleEntries = useMemo(
    () => (showHidden ? entries : entries.filter((e) => !e.name.startsWith("."))),
    [entries, showHidden],
  );
  const isDragOver = dropCount > 0;

  const handleArrowSelect = (direction: 1 | -1) => {
    const result = arrowSelect(visibleEntries.map((e) => e.path), lastClickedPath, cursorPath, direction);
    if (!result) return;
    setSelected(result.selected);
    setLastClickedPath(result.anchorPath);
    setCursorPath(result.cursorPath);
    listRef.current?.scrollToRow({ index: result.cursorIndex, align: "auto" });
  };

  // Ref keeps the handler current without re-registering the listener on every render.
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandlerRef.current = (e: KeyboardEvent) => {
    if (!isActive) return;
    if (document.activeElement?.tagName === "INPUT") return;
    if ((e.metaKey || e.ctrlKey) && e.key === "a") {
      e.preventDefault();
      setSelected(visibleEntries.map((entry) => entry.path));
    }
    if (e.shiftKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      handleArrowSelect(e.key === "ArrowDown" ? 1 : -1);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []); // stable: ref always holds the latest handler

  const handleDragStart = useCallback((entry: LocalFileEntry, e: React.DragEvent) => {
    if (renaming === entry.path) { e.preventDefault(); return; }
    const paths = selectedSet.has(entry.path) ? [...selectedSet] : [entry.path];
    e.dataTransfer.setData("application/x-local-paths", JSON.stringify(paths));
    e.dataTransfer.effectAllowed = "copy";
    setDragImage(e, entry.name, paths.length);
  }, [renaming, selectedSet]);
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
        setCursorPath(entry.path);
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
    setCursorPath(entry.path);
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

  // Right-click on empty space (below the rows, or an empty directory) — directory-scoped actions only.
  const handleBackgroundContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onActivate();
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 100);
    setContextMenu({ x, y, entry: null });
  }, [onActivate]);

  const closeMenu = () => setContextMenu(null);

  const [colFracs, setColFracs] = useState([2.0, 1.0, 1.5]);
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
    onDragStart: handleDragStart,
  }), [visibleEntries, selectedSet, renaming, renameValue, handleRowClick, handleContextMenu, commitRename, handleDragStart]);

  const cm = contextMenu;
  const entry = cm?.entry ?? null;
  const selCount = selected.length;

  return (
    <div
      className={`flex flex-col h-full min-w-0 transition-colors ${isDragOver && onDropRemotePaths ? "ring-2 ring-inset ring-accent/60 bg-accent/5" : ""}`}
      onDragEnter={() => { if (onDropRemotePaths) setDropCount((c) => c + 1); }}
      onDragLeave={() => { if (onDropRemotePaths) setDropCount((c) => Math.max(0, c - 1)); }}
      onDragOver={(e) => { if (onDropRemotePaths) e.preventDefault(); }}
      onDrop={(e) => {
        setDropCount(0);
        const data = e.dataTransfer.getData("application/x-remote-paths");
        if (data && onDropRemotePaths) {
          e.preventDefault();
          onDropRemotePaths(JSON.parse(data) as string[]);
        }
      }}
    >
      {/* Pane header */}
      <div className="flex items-center gap-3 px-3 py-2.5 border-b border-stroke-subtle bg-surface-1 shrink-0">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleUp}
          disabled={currentPath === "/" || loading}
          className="text-muted hover:text-white hover:bg-surface-3"
          title="Go up"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 16 16" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12V4M4 8l4-4 4 4" />
          </svg>
        </Button>
        <PathBar path={currentPath} busy={loading} onNavigateTo={(p) => { void navigateTo(p); }} />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => { void navigateTo(currentPath); }}
          disabled={loading}
          className="text-muted hover:text-white hover:bg-surface-3"
          title="Refresh"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </Button>
      </div>

      {confirmingDelete && (
        <ConfirmDeleteModal
          title={`Delete ${selCount} item${selCount !== 1 ? "s" : ""}?`}
          description="These files will be permanently deleted. This cannot be undone."
          onConfirm={() => { void commitDelete(); }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      {/* Error banner */}
      {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}

      {/* New folder input */}
      {creatingFolder && <InlineCreateInput label="New folder:" placeholder="folder-name" onCommit={(v) => { void commitNewFolder(v); }} onCancel={() => setCreatingFolder(false)} />}

      {/* New file input */}
      {creatingFile && <InlineCreateInput label="New file:" placeholder="filename.txt" onCommit={(v) => { void commitNewFile(v); }} onCancel={() => setCreatingFile(false)} />}

      {/* File list */}
      <div
        className="flex flex-col flex-1 min-h-0"
        style={{ "--local-col": gridTemplateColumns } as React.CSSProperties}
      >
        {/* Column header — always visible, outside the virtual list */}
        {visibleEntries.length > 0 && (
          <div
            ref={headerRef}
            className="grid sticky top-0 z-10 bg-surface-1 border-b border-stroke-subtle shrink-0"
            style={{ gridTemplateColumns: "var(--local-col)" }}
          >
            <div className="relative px-2 py-1 font-medium text-xs uppercase tracking-wider flex items-center text-faint">
              Name
              <div className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize z-20 group" onPointerDown={handleResizeStart(0)}>
                <div className="absolute inset-y-1 left-1/2 -translate-x-1/2 w-px bg-stroke-subtle group-hover:bg-accent/60 transition-colors rounded-full" />
              </div>
            </div>
            <div className="relative px-2 py-1 font-medium text-xs uppercase tracking-wider flex items-center justify-center text-faint">
              Size
              <div className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize z-20 group" onPointerDown={handleResizeStart(1)}>
                <div className="absolute inset-y-1 left-1/2 -translate-x-1/2 w-px bg-stroke-subtle group-hover:bg-accent/60 transition-colors rounded-full" />
              </div>
            </div>
            <div className="px-2 py-1 font-medium text-xs uppercase tracking-wider flex items-center justify-center text-faint">Modified</div>
          </div>
        )}

        <div className="flex-1 min-h-0 relative" onContextMenu={handleBackgroundContextMenu}>
          {!error && visibleEntries.length === 0 && !loading && (
            <div className="flex items-center justify-center h-full text-dim text-sm">
              Empty directory
            </div>
          )}

          {visibleEntries.length > 0 && (
            <AutoSizer
              renderProp={({ height, width }) => (
                <List
                  listRef={listRef}
                  style={{ height: height ?? 0, width: width ?? 0 }}
                  rowCount={visibleEntries.length}
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
            {entry && (
              <>
                <MenuItem
                  onClick={() => { if (entry) void localCommands.openLocal(entry.path); closeMenu(); }}
                  disabled={entry.isDir}
                >
                  Open
                </MenuItem>
                <MenuItem onClick={() => { if (entry) void localCommands.revealInFinder(entry.path); closeMenu(); }}>
                  Reveal in Finder
                </MenuItem>
              </>
            )}
            <MenuItem onClick={() => { setCreatingFolder(true); closeMenu(); }}>
              New Folder
            </MenuItem>

            <div className="my-1 border-t border-stroke-subtle" />

            <MenuItem
              onClick={() => {
                if (!entry) return;
                setRenaming(entry.path);
                setRenameValue(entry.name);
                setSelected([entry.path]);
                closeMenu();
              }}
              disabled={selCount !== 1 || !entry}
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
