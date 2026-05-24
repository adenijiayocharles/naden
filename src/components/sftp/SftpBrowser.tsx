import React, { useState, useEffect, useRef, useMemo } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { useSftpStore } from "../../store/sftpStore";
import { sftpCommands } from "../../lib/tauriCommands";
import { formatError } from "../../lib/errors";
import SftpFileList, { type SortKey, type SortDir } from "./SftpFileList";
import SftpToolbar, { PathBar } from "./SftpToolbar";
import LocalFileBrowser from "./LocalFileBrowser";
import { ConnectingOverlay, ErrorOverlay } from "../shared/ConnectionOverlay";
import InlineCreateInput from "./InlineCreateInput";
import DeleteConfirmBanner from "./DeleteConfirmBanner";
import ErrorBanner from "./ErrorBanner";
import { joinPath, parentPath } from "../../lib/path";

interface Props {
  sessionId: string;
}

interface Clipboard {
  paths: string[];
  sourceDir: string;
  mode: "cut" | "copy";
}

export default function SftpBrowser({ sessionId }: Props) {
  const session = useSftpStore((s) => s.sessions.find((t) => t.id === sessionId));
  const navigateTo = useSftpStore((s) => s.navigateTo);
  const closeSession = useSftpStore((s) => s.closeSession);
  const reconnectSession = useSftpStore((s) => s.reconnectSession);

  // Selection
  const [selected, setSelected] = useState<string[]>([]);
  const [lastClickedPath, setLastClickedPath] = useState<string | null>(null);

  // Clipboard (cut/paste = move)
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);

  // Inline editing
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creatingFile, setCreatingFile] = useState(false);

  // Viewing options — separate state per pane
  const [showHidden, setShowHidden] = useState(true);       // remote
  const [showHiddenLocal, setShowHiddenLocal] = useState(true); // local
  const [localNewFolderTrigger, setLocalNewFolderTrigger] = useState(0);
  const [localNewFileTrigger, setLocalNewFileTrigger] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  // UI state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [transferProgress, setTransferProgress] = useState<string | null>(null);

  // Chmod dialog state
  const [chmodTarget, setChmodTarget] = useState<{ path: string; mode: number } | null>(null);
  const [chmodMode, setChmodMode] = useState(0o644);

  // Edit (live-sync) state
  const [editingFiles, setEditingFiles] = useState<string[]>([]);
  const [fileSyncedFlash, setFileSyncedFlash] = useState<string | null>(null);

  // Sync folder state
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);

  // Local pane state
  const [showLocalPane, setShowLocalPane] = useState(false);
  const [localSelected, setLocalSelected] = useState<string[]>([]);
  const [localCurrentPath, setLocalCurrentPath] = useState("");
  const [activePane, setActivePane] = useState<"local" | "remote">("remote");

  // Listen for live-edit sync events
  useEffect(() => {
    const unlisten = listen<string>(`sftp:file_synced:${sessionId}`, ({ payload }) => {
      const name = payload.split("/").pop() ?? payload;
      setFileSyncedFlash(`Synced: ${name}`);
      setTimeout(() => setFileSyncedFlash(null), 3000);
    });
    return () => { void unlisten.then((fn) => fn()); };
  }, [sessionId]);

  // Listen for folder sync progress events
  useEffect(() => {
    const unlisten = listen<{ file: string; count: number }>(
      `sftp:sync_progress:${sessionId}`,
      ({ payload }) => {
        const name = payload.file.split("/").pop() ?? payload.file;
        setSyncProgress(`Syncing… ${payload.count} file${payload.count > 1 ? "s" : ""} (${name})`);
      },
    );
    return () => { void unlisten.then((fn) => fn()); };
  }, [sessionId]);

  // Ref keeps the handler current without re-registering the listener on every render.
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandlerRef.current = (e: KeyboardEvent) => {
    if (document.activeElement?.tagName === "INPUT") return;
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "Escape") {
      setRenaming(null);
      setCreatingFolder(false);
      setCreatingFile(false);
      setConfirmingDelete(false);
      setClipboard(null);
      setError(null);
      return;
    }
    if (!session) return;
    if (mod && e.key === "r") { e.preventDefault(); handleRefresh(); }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []); // stable: ref always holds the latest handler

  const visibleEntries = useMemo(() =>
    [...(session?.entries ?? [])]
      .filter((e) => showHidden || !e.name.startsWith("."))
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        const dir = sortDir === "asc" ? 1 : -1;
        if (sortKey === "size")     return dir * (a.size - b.size);
        if (sortKey === "modified") return dir * ((a.modified ?? 0) - (b.modified ?? 0));
        return dir * a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      }),
    [session?.entries, showHidden, sortKey, sortDir],
  );

  if (!session) return null;

  const isBusy = busy || session.loadingEntries;
  const selectedEntries = session.entries.filter((e) => selected.includes(e.path));
  const selectedHasDir = selectedEntries.some((e) => e.isDir);

  const navigate = async (path: string) => {
    setSelected([]);
    setLastClickedPath(null);
    setError(null);
    try {
      await navigateTo(sessionId, path);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleNavigateEntry = (entry: { isDir: boolean; path: string }) => {
    if (entry.isDir) navigate(entry.path).catch(() => {});
  };

  const handleUp = () => {
    navigate(parentPath(session.currentPath)).catch(() => {});
  };

  const handleRefresh = () => navigate(session.currentPath).catch(() => {});

  // ── Selection ──────────────────────────────────────────────────────────────

  const handleSelect = (path: string, meta: boolean, shift: boolean) => {
    setActivePane("remote");
    const allPaths = session.entries.map((e) => e.path);

    if (shift && lastClickedPath) {
      const from = allPaths.indexOf(lastClickedPath);
      const to = allPaths.indexOf(path);
      if (from !== -1 && to !== -1) {
        const [start, end] = from <= to ? [from, to] : [to, from];
        const range = allPaths.slice(start, end + 1);
        setSelected((prev) => [...new Set([...prev, ...range])]);
        return;
      }
    }

    if (meta) {
      setSelected((prev) =>
        prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
      );
    } else {
      setSelected([path]);
    }

    setLastClickedPath(path);
  };

  // ── Upload / Download ──────────────────────────────────────────────────────

  const handleUpload = async () => {
    // When local pane is active, upload the selected local files directly.
    if (showLocalPane && activePane === "local") {
      await handleUploadFromLocal();
      return;
    }
    const result = await open({ multiple: false, title: "Choose file to upload" });
    if (typeof result !== "string") return;
    const localPath = result;
    const remoteName = localPath.split("/").pop() ?? "upload";
    const remotePath = joinPath(session.currentPath, remoteName);
    setBusy(true);
    setTransferProgress(`Uploading ${remoteName}…`);
    setError(null);
    try {
      await sftpCommands.uploadSftpFile(sessionId, localPath, remotePath);
      setTransferProgress(null);
      await navigate(session.currentPath);
    } catch (e) {
      setError(formatError(e));
      setTransferProgress(null);
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    // When local pane is active, download remote selection into the current local dir.
    if (showLocalPane && activePane === "local") {
      await handleDownloadToLocal();
      return;
    }
    const files = selectedEntries.filter((e) => !e.isDir);
    if (files.length === 0) return;

    if (files.length === 1) {
      const file = files[0];
      const localPath = await save({ defaultPath: file.name, title: "Save file as" });
      if (!localPath) return;
      setBusy(true);
      setTransferProgress(`Downloading ${file.name}…`);
      setError(null);
      try {
        await sftpCommands.downloadSftpFile(sessionId, file.path, localPath);
        setTransferProgress(null);
      } catch (e) {
        setError(formatError(e));
        setTransferProgress(null);
      } finally {
        setBusy(false);
      }
      return;
    }

    // Multi-file download: prompt for a folder, then download each file into it
    const folder = await open({ directory: true, title: "Choose destination folder" });
    if (typeof folder !== "string") return;
    setBusy(true);
    setError(null);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setTransferProgress(`Downloading ${file.name} (${i + 1}/${files.length})…`);
      try {
        await sftpCommands.downloadSftpFile(sessionId, file.path, joinPath(folder, file.name));
      } catch (e) {
        setError(formatError(e));
        break;
      }
    }
    setTransferProgress(null);
    setBusy(false);
  };

  // ── New Folder / New File ──────────────────────────────────────────────────

  const handleNewFolder = () => {
    if (showLocalPane && activePane === "local") {
      setLocalNewFolderTrigger((n) => n + 1);
    } else {
      setCreatingFolder(true);
    }
  };

  const commitNewFolder = async (name: string) => {
    if (!name) { setCreatingFolder(false); return; }
    setBusy(true);
    setError(null);
    try {
      await sftpCommands.mkdirSftp(sessionId, joinPath(session.currentPath, name));
      setCreatingFolder(false);
      await navigate(session.currentPath);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleNewFile = () => {
    if (showLocalPane && activePane === "local") {
      setLocalNewFileTrigger((n) => n + 1);
    } else {
      setCreatingFile(true);
    }
  };

  const commitNewFile = async (name: string) => {
    if (!name) { setCreatingFile(false); return; }
    setBusy(true);
    setError(null);
    try {
      await sftpCommands.touchSftpFile(sessionId, joinPath(session.currentPath, name));
      setCreatingFile(false);
      await navigate(session.currentPath);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = () => { if (selected.length > 0) setConfirmingDelete(true); };

  const commitDelete = async () => {
    setConfirmingDelete(false);
    setBusy(true);
    setError(null);
    try {
      let failed = 0;
      for (const path of selected) {
        try {
          await sftpCommands.deleteSftp(sessionId, path);
        } catch {
          failed++;
        }
      }
      if (failed > 0) setError(`${failed} item(s) could not be deleted.`);
      setSelected([]);
      await navigate(session.currentPath);
    } finally {
      setBusy(false);
    }
  };

  // ── Rename (inline) ────────────────────────────────────────────────────────

  const handleRenameStart = (path: string) => {
    const entry = session.entries.find((e) => e.path === path);
    if (!entry) return;
    setRenaming(path);
    setRenameValue(entry.name);
    setSelected([path]);
  };


  const commitRename = async () => {
    if (!renaming || !renameValue.trim()) { setRenaming(null); return; }
    const dir = renaming.split("/").slice(0, -1).join("/");
    const newPath = `${dir}/${renameValue.trim()}`;
    if (newPath === renaming) { setRenaming(null); return; }
    setBusy(true);
    setError(null);
    try {
      await sftpCommands.renameSftp(sessionId, renaming, newPath);
      setRenaming(null);
      setSelected([]);
      await navigate(session.currentPath);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  // ── Cut / Paste (move) ─────────────────────────────────────────────────────

  const handleCut = () => {
    if (selected.length === 0) return;
    setClipboard({ paths: selected, sourceDir: session.currentPath, mode: "cut" });
  };

  const handleCopy = () => {
    if (selected.length === 0) return;
    setClipboard({ paths: selected, sourceDir: session.currentPath, mode: "copy" });
  };

  const handlePaste = async () => {
    if (!clipboard) return;
    setBusy(true);
    setError(null);
    let failed = 0;
    let firstError: string | null = null;
    for (const srcPath of clipboard.paths) {
      const name = srcPath.split("/").pop() ?? srcPath;
      const destPath = joinPath(session.currentPath, name);
      // Skip if source and destination are identical (pasting into same folder with cut)
      if (srcPath === destPath) continue;
      try {
        if (clipboard.mode === "cut") {
          await sftpCommands.renameSftp(sessionId, srcPath, destPath);
        } else {
          await sftpCommands.copySftpFile(sessionId, srcPath, destPath);
        }
      } catch (e) {
        failed++;
        if (!firstError) firstError = formatError(e);
      }
    }
    const verb = clipboard.mode === "cut" ? "moved" : "copied";
    if (failed > 0) setError(`${failed} item(s) could not be ${verb}: ${firstError ?? "unknown error"}`);
    setClipboard(null);
    setSelected([]);
    await navigate(session.currentPath);
    setBusy(false);
  };

  // ── Chmod ──────────────────────────────────────────────────────────────────

  const handleChmod = (path: string, currentMode: number) => {
    setChmodMode(currentMode & 0o777);
    setChmodTarget({ path, mode: currentMode & 0o777 });
  };

  const commitChmod = async () => {
    if (!chmodTarget) return;
    setBusy(true);
    setError(null);
    try {
      await sftpCommands.chmodSftp(sessionId, chmodTarget.path, chmodMode);
      setChmodTarget(null);
      await navigate(session.currentPath);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  // ── Edit file (live-sync) ──────────────────────────────────────────────────

  const handleOpenEdit = async (remotePath: string) => {
    setBusy(true);
    setError(null);
    try {
      await sftpCommands.openSftpEdit(sessionId, remotePath);
      setEditingFiles((prev) => [...new Set([...prev, remotePath])]);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleCloseEdit = async (remotePath: string) => {
    try {
      await sftpCommands.closeSftpEdit(sessionId, remotePath);
    } catch {
      // best-effort
    }
    setEditingFiles((prev) => prev.filter((p) => p !== remotePath));
  };

  // ── Local pane transfers ───────────────────────────────────────────────────

  const handleUploadFromLocal = async () => {
    if (localSelected.length === 0 || !session) return;
    setBusy(true);
    setError(null);
    try {
      for (const localPath of localSelected) {
        const name = localPath.split("/").pop() ?? localPath;
        const remotePath = joinPath(session.currentPath, name);
        await sftpCommands.uploadSftpFile(sessionId, localPath, remotePath);
      }
      await navigate(session.currentPath);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadToLocal = async () => {
    const files = selectedEntries.filter((e) => !e.isDir);
    if (files.length === 0 || !localCurrentPath) return;
    setBusy(true);
    setError(null);
    try {
      for (const entry of files) {
        const name = entry.path.split("/").pop() ?? entry.path;
        const localPath = joinPath(localCurrentPath, name);
        await sftpCommands.downloadSftpFile(sessionId, entry.path, localPath);
      }
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  // ── Sync folder ────────────────────────────────────────────────────────────

  const handleSyncFolder = async () => {
    const localFolder = await open({ directory: true, title: "Choose local folder to sync" });
    if (typeof localFolder !== "string") return;
    setSyncing(true);
    setSyncProgress("Starting sync…");
    setError(null);
    try {
      const count = await sftpCommands.syncSftpFolder(sessionId, localFolder, session.currentPath);
      setSyncProgress(`Sync complete — ${count} file${count !== 1 ? "s" : ""} uploaded`);
      await navigate(session.currentPath);
      setTimeout(() => setSyncProgress(null), 4000);
    } catch (e) {
      setError(formatError(e));
      setSyncProgress(null);
    } finally {
      setSyncing(false);
    }
  };

  const isConnecting = session.status === "connecting";
  const isError = session.status === "error";

  const canUploadFromLocal = activePane === "local" && localSelected.length > 0 && !isBusy;
  const canDownloadToLocal = activePane === "remote" && selectedEntries.some((e) => !e.isDir) && !!localCurrentPath && !isBusy;

  return (
    <div className="relative h-full w-full flex flex-col bg-surface-1">
      <SftpToolbar
        currentPath={session.currentPath}
        selectedCount={selected.length}
        selectedHasDir={selectedHasDir}
        hasClipboard={clipboard !== null}
        clipboardMode={clipboard?.mode ?? null}
        onPaste={() => { void handlePaste(); }}
        showHidden={showLocalPane && activePane === "local" ? showHiddenLocal : showHidden}
        onToggleHidden={() => {
          if (showLocalPane && activePane === "local") setShowHiddenLocal((v) => !v);
          else setShowHidden((v) => !v);
        }}
        busy={isBusy || syncing}
        onNavigateTo={(path) => { navigate(path).catch(() => {}); }}
        onNavigateUp={handleUp}
        onRefresh={handleRefresh}
        onUpload={() => { void handleUpload(); }}
        onDownload={() => { void handleDownload(); }}
        onNewFolder={handleNewFolder}
        onNewFile={handleNewFile}
        editingCount={editingFiles.length}
        onSync={() => { void handleSyncFolder(); }}
        syncProgress={syncProgress}
        showLocalPane={showLocalPane}
        onToggleLocalPane={() => setShowLocalPane((v) => !v)}
        activePane={activePane}
        localSelectedCount={localSelected.length}
      />

      <div className="flex flex-1 min-h-0">
        {/* Local pane */}
        {showLocalPane && (
          <>
            <div className="flex-1 min-w-0 border-r border-stroke-subtle flex flex-col">
              <LocalFileBrowser
                onSelectedChange={setLocalSelected}
                onPathChange={setLocalCurrentPath}
                onActivate={() => setActivePane("local")}
                showHidden={showHiddenLocal}
                newFolderTrigger={localNewFolderTrigger}
                newFileTrigger={localNewFileTrigger}
              />
            </div>

            {/* Transfer strip */}
            <div className="w-10 shrink-0 flex flex-col items-center justify-center gap-3 bg-surface-2 border-r border-stroke-subtle">
              <button
                onClick={() => { void handleUploadFromLocal(); }}
                disabled={!canUploadFromLocal}
                title="Upload selected local files to remote"
                className="p-1.5 rounded text-muted hover:text-white hover:bg-surface-4 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
              >
                →
              </button>
              <button
                onClick={() => { void handleDownloadToLocal(); }}
                disabled={!canDownloadToLocal}
                title="Download selected remote files to local"
                className="p-1.5 rounded text-muted hover:text-white hover:bg-surface-4 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
              >
                ←
              </button>
            </div>
          </>
        )}

        {/* Remote pane */}
        <div className="flex-1 min-w-0 flex flex-col">

      {/* Per-pane remote path bar — only in split mode */}
      {showLocalPane && (
        <div className="flex items-center px-3 py-2 border-b border-stroke-subtle bg-surface-1 shrink-0 gap-3">
          <PathBar
            path={session.currentPath}
            busy={isBusy || syncing}
            onNavigateTo={(p) => { navigate(p).catch(() => {}); }}
          />
          {syncProgress ? (
            <span className="text-xs text-accent-fg shrink-0">{syncProgress}</span>
          ) : clipboard ? (
            <span className="text-xs text-accent-fg shrink-0">
              ● {clipboard.mode === "copy" ? "copied" : "cut"} — paste to move here
            </span>
          ) : null}
          {editingFiles.length > 0 && (
            <span className="text-xs text-amber-400 shrink-0 flex items-center gap-1">
              <span className="animate-pulse">●</span>
              Watching {editingFiles.length} file{editingFiles.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* Inline delete confirmation */}
      {confirmingDelete && (
        <DeleteConfirmBanner count={selected.length} onConfirm={() => { void commitDelete(); }} onCancel={() => setConfirmingDelete(false)} />
      )}

      {/* New folder input */}
      {creatingFolder && <InlineCreateInput label="New folder:" placeholder="folder-name" onCommit={(v) => { void commitNewFolder(v); }} onCancel={() => setCreatingFolder(false)} />}

      {/* New file input */}
      {creatingFile && <InlineCreateInput label="New file:" placeholder="filename.txt" onCommit={(v) => { void commitNewFile(v); }} onCancel={() => setCreatingFile(false)} />}

      {/* Error banner */}
      {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}

      {/* Transfer progress */}
      {transferProgress && (
        <div className="px-4 py-2 bg-accent/5 border-b border-stroke-subtle flex items-center gap-3 text-xs text-muted">
          <svg className="w-3 h-3 animate-spin text-accent-fg shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          {transferProgress}
        </div>
      )}

      {/* File synced flash */}
      {fileSyncedFlash && (
        <div className="px-4 py-2 bg-green-950/30 border-b border-green-900/40 flex items-center gap-2 text-xs text-green-400">
          <span>↑</span>
          {fileSyncedFlash}
        </div>
      )}

      {/* Watching files banner */}
      {editingFiles.length > 0 && (
        <div className="px-4 py-1.5 bg-amber-950/20 border-b border-amber-900/30 flex items-center gap-2 text-xs text-amber-400/80">
          <span className="animate-pulse">●</span>
          Watching {editingFiles.length} file{editingFiles.length > 1 ? "s" : ""} for changes
          <div className="flex gap-1 ml-auto">
            {editingFiles.map((p) => (
              <button
                key={p}
                onClick={() => { void handleCloseEdit(p); }}
                className="text-amber-600 hover:text-amber-400 transition-colors px-1 font-mono"
                title={`Stop watching ${p}`}
              >
                {p.split("/").pop()} ×
              </button>
            ))}
          </div>
        </div>
      )}

      <SftpFileList
        entries={visibleEntries}
        selected={selected}
        renaming={renaming}
        renameValue={renameValue}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        onSelect={handleSelect}
        onNavigate={handleNavigateEntry}
        hasClipboard={clipboard !== null}
        onRenameStart={handleRenameStart}
        onRenameChange={setRenameValue}
        onRenameCommit={() => { void commitRename(); }}
        onRenameCancel={() => setRenaming(null)}
        onCut={handleCut}
        onCopy={handleCopy}
        onPaste={() => { void handlePaste(); }}
        onDelete={handleDelete}
        onEdit={(path) => { void handleOpenEdit(path); }}
        onChmod={handleChmod}
      />

        </div> {/* end remote pane */}
      </div> {/* end flex row */}

      {/* Chmod dialog */}
      {chmodTarget && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50">
          <div className="bg-surface-1 border border-stroke-subtle rounded-lg shadow-xl w-80 p-5 flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Change Permissions</h3>
              <p className="text-xs text-faint mt-0.5 font-mono truncate">{chmodTarget.path}</p>
            </div>

            {/* Permission checkboxes */}
            <div className="grid grid-cols-4 gap-y-2 text-xs">
              <div /> {/* spacer */}
              {["Owner", "Group", "Other"].map((label) => (
                <div key={label} className="text-center text-faint font-medium">{label}</div>
              ))}
              {(["r", "w", "x"] as const).map((bit, row) => {
                const shifts = [6, 3, 0]; // owner, group, other offsets
                return (
                  <React.Fragment key={bit}>
                    <div className="text-muted font-mono pr-2">{bit}</div>
                    {shifts.map((shift) => {
                      const mask = 1 << (shift + (2 - row));
                      const checked = (chmodMode & mask) !== 0;
                      return (
                        <div key={`${bit}-${shift}`} className="flex justify-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setChmodMode((m) => checked ? m & ~mask : m | mask)}
                            className="w-3.5 h-3.5 accent-accent"
                          />
                        </div>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Octal display */}
            <div className="text-xs text-center">
              <span className="text-faint">Octal: </span>
              <span className="font-mono text-white">
                {chmodMode.toString(8).padStart(4, "0")}
              </span>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setChmodTarget(null)}
                className="px-3 py-1.5 text-xs text-muted hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { void commitChmod(); }}
                disabled={busy}
                className="px-3 py-1.5 bg-accent hover:bg-accent/80 text-black rounded text-xs font-medium transition-colors disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {isConnecting && (
        <ConnectingOverlay
          serverName={session.serverName}
          onCancel={() => { void closeSession(sessionId); }}
        />
      )}
      {isError && (
        <ErrorOverlay
          errorMessage={session.errorMessage}
          onReconnect={() => { void reconnectSession(sessionId); }}
          onClose={() => { void closeSession(sessionId); }}
        />
      )}
    </div>
  );
}
