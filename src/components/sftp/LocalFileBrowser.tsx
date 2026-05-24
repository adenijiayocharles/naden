import { useState, useEffect, useRef, useCallback } from "react";
import type { LocalFileEntry } from "../../types/local";
import { localCommands } from "../../lib/tauriCommands";
import { formatSize, formatDate } from "../../lib/format";
import { formatError } from "../../lib/errors";
import { PathBar } from "./SftpToolbar";
import { MenuItem, ContextMenuPopup } from "./SftpFileList";

interface Props {
  onSelectedChange: (paths: string[]) => void;
  onPathChange: (path: string) => void;
  onActivate: () => void;
}

interface ContextMenu { x: number; y: number; entry: LocalFileEntry }

function FileIcon({ isDir }: { isDir: boolean }) {
  if (isDir) {
    return (
      <svg className="w-4 h-4 text-accent-fg shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

export default function LocalFileBrowser({ onSelectedChange, onPathChange, onActivate }: Props) {
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

  const handleUp = () => {
    const parent = currentPath.split("/").slice(0, -1).join("/") || "/";
    void navigateTo(parent);
  };

  const handleRowClick = (entry: LocalFileEntry, e: React.MouseEvent) => {
    onActivate();
    if (e.detail === 2) {
      if (entry.isDir) {
        void navigateTo(entry.path);
      } else {
        setRenaming(entry.path);
        setRenameValue(entry.name);
        setSelected([entry.path]);
      }
      return;
    }

    const allPaths = entries.map((en) => en.path);
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
        prev.includes(entry.path) ? prev.filter((p) => p !== entry.path) : [...prev, entry.path],
      );
    } else {
      setSelected([entry.path]);
    }
    setLastClickedPath(entry.path);
  };

  const handleContextMenu = (entry: LocalFileEntry, e: React.MouseEvent) => {
    e.preventDefault();
    onActivate();
    if (!selected.includes(entry.path)) {
      setSelected([entry.path]);
      setLastClickedPath(entry.path);
    }
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 200);
    setContextMenu({ x, y, entry });
  };

  const closeMenu = () => setContextMenu(null);

  const commitRename = async () => {
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
  };

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
        <div className="px-4 py-2 bg-red-950/30 border-b border-red-900/40 flex items-center gap-3 text-xs shrink-0">
          <span className="text-red-300 flex-1">
            Delete <span className="font-semibold">{selCount} item{selCount > 1 ? "s" : ""}</span>? This cannot be undone.
          </span>
          <button onClick={() => { void commitDelete(); }} className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded transition-colors font-semibold">
            Delete
          </button>
          <button onClick={() => setConfirmingDelete(false)} className="text-faint hover:text-white transition-colors">
            Cancel
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-950/40 border-b border-red-900/50 text-xs text-red-400 flex items-center justify-between shrink-0">
          {error}
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-400 ml-4">×</button>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto relative">
        {!error && entries.length === 0 && !loading && (
          <div className="flex-1 flex items-center justify-center text-dim text-sm p-8">
            Empty directory
          </div>
        )}
        {entries.length > 0 && (
          <table className="w-full text-sm border-collapse table-fixed">
            <thead className="sticky top-0 bg-surface-1 z-10 border-b border-stroke-subtle">
              <tr>
                <th className="w-1/2 px-2 py-2 font-medium text-xs uppercase tracking-wider text-left text-faint">Name</th>
                <th className="w-1/4 px-2 py-2 font-medium text-xs uppercase tracking-wider text-right text-faint">Size</th>
                <th className="w-1/4 px-2 py-2 font-medium text-xs uppercase tracking-wider text-right text-faint">Modified</th>
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
                    onContextMenu={(e) => handleContextMenu(entry, e)}
                    className={`cursor-pointer border-b border-stroke-subtle transition-colors select-none ${
                      isSelected ? "bg-accent/10 text-accent-fg" : "text-secondary hover:bg-surface-2 hover:text-white"
                    }`}
                  >
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <FileIcon isDir={entry.isDir} />
                        {isRenaming ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === "Enter") void commitRename();
                              if (e.key === "Escape") setRenaming(null);
                            }}
                            onBlur={() => { void commitRename(); }}
                            className="flex-1 h-6 bg-surface-3 border border-accent rounded px-1.5 text-xs text-white outline-none font-mono min-w-0"
                          />
                        ) : (
                          <span className="truncate font-mono text-xs" title={entry.name}>{entry.name}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right text-faint font-mono text-xs tabular-nums">
                      {formatSize(entry.size, entry.isDir)}
                    </td>
                    <td className="px-2 py-2 text-right text-faint text-xs">
                      {formatDate(entry.modified)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Context menu */}
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
