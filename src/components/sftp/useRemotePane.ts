import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { useSftpStore, type SftpSession } from "../../store/sftpStore";
import { sftpCommands } from "../../lib/tauriCommands";
import { formatError, isAlreadyExistsError, isCancelledError } from "../../lib/errors";
import { joinPath, parentPath } from "../../lib/path";
import { arrowSelect } from "../../lib/rangeSelect";
import type { SortKey, SortDir } from "./SftpFileList";
import type { FileEntry } from "../../types/sftp";

interface Clipboard {
  paths: string[];
  sourceDir: string;
  mode: "cut" | "copy";
}

interface RemotePaneInput {
  sessionId: string;
  showHidden: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
  localCurrentPath: string;
  localSelected: string[];
  activePane: "local" | "remote";
  showLocalPane: boolean;
  /** Whether this pane is the one currently focused — gates global shortcuts like Cmd/Ctrl+A. */
  isActive: boolean;
  /** Called after a download to the local pane completes, so the local file list can refresh. */
  refreshLocalPane?: () => void;
}

interface RemotePaneOutput {
  session: SftpSession | undefined;
  isBusy: boolean;
  visibleEntries: FileEntry[];
  selected: string[];
  lastClickedPath: string | null;
  cursorPath: string | null;
  selectedEntries: FileEntry[];
  selectedHasDir: boolean;
  clipboard: Clipboard | null;
  renaming: string | null;
  renameValue: string;
  creatingFolder: boolean;
  creatingFile: boolean;
  error: string | null;
  confirmingDelete: boolean;
  overwriteConfirm: { message: string; onConfirm: () => void } | null;
  cancelOverwriteConfirm: () => void;
  transferProgress: string | null;
  transferByteProgress: { bytes: number; total: number } | null;
  chmodTarget: { path: string; mode: number } | null;
  chmodMode: number;
  editingFiles: string[];
  fileSyncedFlash: string | null;
  handleSelect: (path: string, meta: boolean, shift: boolean) => void;
  handleNavigateEntry: (entry: { isDir: boolean; path: string }) => void;
  handleUp: () => void;
  handleRefresh: () => void;
  handleUpload: () => void;
  handleDownload: () => void;
  handleCancelTransfer: () => void;
  handleNewFolder: () => void;
  handleNewFile: () => void;
  handleDelete: () => void;
  commitDelete: () => void;
  handleRenameStart: (path: string) => void;
  setRenameValue: (v: string) => void;
  commitRename: () => void;
  setRenaming: (v: string | null) => void;
  handleCut: () => void;
  handleCopy: () => void;
  handlePaste: () => void;
  handleChmod: (path: string, mode: number) => void;
  setChmodMode: (mode: number) => void;
  commitChmod: () => void;
  cancelChmod: () => void;
  handleOpenEdit: (path: string) => void;
  handleCloseEdit: (path: string) => void;
  handleUploadFromLocal: () => void;
  handleDownloadToLocal: () => void;
  handleUploadPaths: (localPaths: string[]) => void;
  handleDownloadPaths: (remotePaths: string[]) => void;
  commitNewFolder: (name: string) => void;
  commitNewFile: (name: string) => void;
  setConfirmingDelete: (v: boolean) => void;
  setError: (v: string | null) => void;
  setCreatingFolder: (v: boolean) => void;
  setCreatingFile: (v: boolean) => void;
  navigate: (path: string) => void;
}

export function useRemotePane(input: RemotePaneInput): RemotePaneOutput {
  const { sessionId, showHidden, sortKey, sortDir, localCurrentPath, localSelected, activePane, showLocalPane, isActive, refreshLocalPane } = input;

  const session = useSftpStore((s) => s.sessions.find((t) => t.id === sessionId));
  const navigateTo = useSftpStore((s) => s.navigateTo);

  // Selection
  const [selected, setSelected] = useState<string[]>([]);
  const [lastClickedPath, setLastClickedPath] = useState<string | null>(null);
  // Tracks the moving end of a shift+arrow range; the anchor (lastClickedPath) stays fixed.
  const [cursorPath, setCursorPath] = useState<string | null>(null);

  // Clipboard (cut/paste = move)
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);

  // Inline editing
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creatingFile, setCreatingFile] = useState(false);

  // UI state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [overwriteConfirm, setOverwriteConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [transferProgress, setTransferProgress] = useState<string | null>(null);
  const [transferByteProgress, setTransferByteProgress] = useState<{ bytes: number; total: number } | null>(null);

  // Chmod dialog state
  const [chmodTarget, setChmodTarget] = useState<{ path: string; mode: number } | null>(null);
  const [chmodMode, setChmodMode] = useState(0o644);

  // Edit (live-sync) state
  const [editingFiles, setEditingFiles] = useState<string[]>([]);
  const [fileSyncedFlash, setFileSyncedFlash] = useState<string | null>(null);

  // Listen for live-edit sync events and byte-level transfer progress
  useEffect(() => {
    const unlisteners = Promise.all([
      listen<string>(`sftp:file_synced:${sessionId}`, ({ payload }) => {
        const name = payload.split("/").pop() ?? payload;
        setFileSyncedFlash(`Synced: ${name}`);
        setTimeout(() => setFileSyncedFlash(null), 3000);
        // Do NOT remove from editingFiles here — this event fires on every save
        // pulse. Removal happens only in handleCloseEdit so the user retains
        // control over which files are being watched.
      }),
      listen<{ written: number; total: number }>(`sftp:upload_progress:${sessionId}`, ({ payload }) => {
        setTransferByteProgress({ bytes: payload.written, total: payload.total });
      }),
      listen<{ read: number; total: number }>(`sftp:download_progress:${sessionId}`, ({ payload }) => {
        setTransferByteProgress({ bytes: payload.read, total: payload.total });
      }),
    ]);
    return () => { void unlisteners.then(([u1, u2, u3]) => { u1(); u2(); u3(); }); };
  }, [sessionId]);

  // Clear byte progress when no transfer is running
  useEffect(() => {
    if (!busy) setTransferByteProgress(null);
  }, [busy]);

  const navigate = useCallback(async (path: string) => {
    setSelected([]);
    setLastClickedPath(null);
    setCursorPath(null);
    setError(null);
    try {
      await navigateTo(sessionId, path);
    } catch (e) {
      setError(formatError(e));
    }
  }, [sessionId, navigateTo]);

  const handleNavigateEntry = (entry: { isDir: boolean; path: string }) => {
    if (entry.isDir) navigate(entry.path).catch(() => {});
  };

  const handleUp = () => {
    if (!session) return;
    navigate(parentPath(session.currentPath)).catch(() => {});
  };

  const handleRefresh = () => {
    navigate(session?.currentPath ?? "/").catch(() => {});
  };

  // ── Selection ──────────────────────────────────────────────────────────────

  const handleSelect = (path: string, meta: boolean, shift: boolean) => {
    if (!session) return;
    const allPaths = session.entries.map((e) => e.path);

    if (shift && lastClickedPath) {
      const from = allPaths.indexOf(lastClickedPath);
      const to = allPaths.indexOf(path);
      if (from !== -1 && to !== -1) {
        const [start, end] = from <= to ? [from, to] : [to, from];
        const range = allPaths.slice(start, end + 1);
        setSelected((prev) => [...new Set([...prev, ...range])]);
        setCursorPath(path);
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
    setCursorPath(path);
  };

  const handleArrowSelect = (direction: 1 | -1) => {
    const result = arrowSelect(visibleEntries.map((e) => e.path), lastClickedPath, cursorPath, direction);
    if (!result) return;
    setSelected(result.selected);
    setLastClickedPath(result.anchorPath);
    setCursorPath(result.cursorPath);
  };

  // ── Upload / Download ──────────────────────────────────────────────────────

  const handleCancelTransfer = () => {
    void sftpCommands.cancelSftpTransfer(sessionId);
  };

  const handleUploadFromLocal = async (overwrite = false, startIndex = 0) => {
    if (localSelected.length === 0 || !session) return;
    setBusy(true);
    setError(null);
    for (let i = startIndex; i < localSelected.length; i++) {
      const localPath = localSelected[i];
      const name = localPath.split("/").pop() ?? localPath;
      setTransferProgress(localSelected.length > 1 ? `Uploading ${name} (${i + 1}/${localSelected.length})…` : `Uploading ${name}…`);
      try {
        await sftpCommands.uploadSftpFile(sessionId, localPath, joinPath(session.currentPath, name), overwrite);
      } catch (e) {
        setTransferProgress(null);
        setBusy(false);
        if (isCancelledError(e)) return;
        if (isAlreadyExistsError(e) && !overwrite) {
          setOverwriteConfirm({ message: formatError(e), onConfirm: () => { setOverwriteConfirm(null); void handleUploadFromLocal(true, i); } });
          return;
        }
        setError(formatError(e));
        return;
      }
    }
    setTransferProgress(null);
    await navigate(session.currentPath);
    setBusy(false);
  };

  const handleDownloadToLocal = async (overwrite = false, startIndex = 0) => {
    if (!session) return;
    const items = session.entries.filter((e) => selected.includes(e.path));
    if (items.length === 0 || !localCurrentPath) return;
    setBusy(true);
    setError(null);
    for (let i = startIndex; i < items.length; i++) {
      const entry = items[i];
      const name = entry.path.split("/").pop() ?? entry.path;
      setTransferProgress(items.length > 1 ? `Downloading ${name} (${i + 1}/${items.length})…` : `Downloading ${name}…`);
      try {
        await sftpCommands.downloadSftpFile(sessionId, entry.path, joinPath(localCurrentPath, name), overwrite);
      } catch (e) {
        setTransferProgress(null);
        setBusy(false);
        if (isCancelledError(e)) return;
        if (isAlreadyExistsError(e) && !overwrite) {
          setOverwriteConfirm({ message: formatError(e), onConfirm: () => { setOverwriteConfirm(null); void handleDownloadToLocal(true, i); } });
          return;
        }
        setError(formatError(e));
        return;
      }
    }
    setTransferProgress(null);
    setBusy(false);
    refreshLocalPane?.();
  };

  const handleUploadPaths = async (localPaths: string[], overwrite = false, startIndex = 0) => {
    if (!session || localPaths.length === 0) return;
    setBusy(true);
    setError(null);
    for (let i = startIndex; i < localPaths.length; i++) {
      const localPath = localPaths[i];
      const name = localPath.split("/").pop() ?? localPath;
      setTransferProgress(localPaths.length > 1 ? `Uploading ${name} (${i + 1}/${localPaths.length})…` : `Uploading ${name}…`);
      try {
        await sftpCommands.uploadSftpFile(sessionId, localPath, joinPath(session.currentPath, name), overwrite);
      } catch (e) {
        setTransferProgress(null);
        setBusy(false);
        if (isCancelledError(e)) return;
        if (isAlreadyExistsError(e) && !overwrite) {
          setOverwriteConfirm({ message: formatError(e), onConfirm: () => { setOverwriteConfirm(null); void handleUploadPaths(localPaths, true, i); } });
          return;
        }
        setError(formatError(e));
        return;
      }
    }
    setTransferProgress(null);
    await navigate(session.currentPath);
    setBusy(false);
  };

  const handleDownloadPaths = async (remotePaths: string[], overwrite = false, startIndex = 0) => {
    if (!session || remotePaths.length === 0 || !localCurrentPath) return;
    const items = session.entries.filter((e) => remotePaths.includes(e.path));
    if (items.length === 0) return;
    setBusy(true);
    setError(null);
    for (let i = startIndex; i < items.length; i++) {
      const entry = items[i];
      const name = entry.path.split("/").pop() ?? entry.path;
      setTransferProgress(items.length > 1 ? `Downloading ${name} (${i + 1}/${items.length})…` : `Downloading ${name}…`);
      try {
        await sftpCommands.downloadSftpFile(sessionId, entry.path, joinPath(localCurrentPath, name), overwrite);
      } catch (e) {
        setTransferProgress(null);
        setBusy(false);
        if (isCancelledError(e)) return;
        if (isAlreadyExistsError(e) && !overwrite) {
          setOverwriteConfirm({ message: formatError(e), onConfirm: () => { setOverwriteConfirm(null); void handleDownloadPaths(remotePaths, true, i); } });
          return;
        }
        setError(formatError(e));
        return;
      }
    }
    setTransferProgress(null);
    setBusy(false);
    refreshLocalPane?.();
  };

  const handleUpload = async (overwrite = false, localPath?: string, remotePath?: string, remoteName?: string) => {
    if (!localPath && showLocalPane && activePane === "local") {
      await handleUploadFromLocal();
      return;
    }
    if (!session) return;
    let lp = localPath;
    let rp = remotePath;
    let name = remoteName;
    if (!lp || !rp || !name) {
      const result = await open({ multiple: false, title: "Choose file to upload" });
      if (typeof result !== "string") return;
      lp = result;
      name = lp.split("/").pop() ?? "upload";
      rp = joinPath(session.currentPath, name);
    }
    setBusy(true);
    setTransferProgress(`Uploading ${name}…`);
    setError(null);
    try {
      await sftpCommands.uploadSftpFile(sessionId, lp, rp, overwrite);
      setTransferProgress(null);
      await navigate(session.currentPath);
    } catch (e) {
      setTransferProgress(null);
      if (isCancelledError(e)) return;
      if (isAlreadyExistsError(e) && !overwrite) {
        setBusy(false);
        setOverwriteConfirm({ message: formatError(e), onConfirm: () => { setOverwriteConfirm(null); void handleUpload(true, lp, rp, name); } });
        return;
      }
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async (overwrite = false, startIndex = 0, folderOverride?: string) => {
    if (!folderOverride && showLocalPane && activePane === "local") {
      await handleDownloadToLocal();
      return;
    }
    if (!session) return;
    const selectedEntries = session.entries.filter((e) => selected.includes(e.path));
    const files = selectedEntries.filter((e) => !e.isDir);
    if (files.length === 0) return;

    if (files.length === 1 && !folderOverride) {
      const file = files[0];
      const localPath = await save({ defaultPath: file.name, title: "Save file as" });
      if (!localPath) return;
      setBusy(true);
      setTransferProgress(`Downloading ${file.name}…`);
      setError(null);
      try {
        // The save dialog already confirms overwrite with the OS.
        await sftpCommands.downloadSftpFile(sessionId, file.path, localPath, true);
        setTransferProgress(null);
      } catch (e) {
        setTransferProgress(null);
        if (!isCancelledError(e)) setError(formatError(e));
      } finally {
        setBusy(false);
      }
      return;
    }

    // Multi-file download: prompt for a folder, then download each file into it
    let folder = folderOverride;
    if (!folder) {
      const picked = await open({ directory: true, title: "Choose destination folder" });
      if (typeof picked !== "string") return;
      folder = picked;
    }
    const folderPath = folder;
    setBusy(true);
    setError(null);
    for (let i = startIndex; i < files.length; i++) {
      const file = files[i];
      setTransferProgress(`Downloading ${file.name} (${i + 1}/${files.length})…`);
      try {
        await sftpCommands.downloadSftpFile(sessionId, file.path, joinPath(folderPath, file.name), overwrite);
      } catch (e) {
        setTransferProgress(null);
        if (isCancelledError(e)) break;
        if (isAlreadyExistsError(e) && !overwrite) {
          setBusy(false);
          setOverwriteConfirm({ message: formatError(e), onConfirm: () => { setOverwriteConfirm(null); void handleDownload(true, i, folderPath); } });
          return;
        }
        setError(formatError(e));
        break;
      }
    }
    setTransferProgress(null);
    setBusy(false);
  };

  // ── New Folder / New File ──────────────────────────────────────────────────

  const handleNewFolder = () => {
    setCreatingFolder(true);
  };

  const commitNewFolder = async (name: string) => {
    if (!name || !session) { setCreatingFolder(false); return; }
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
    setCreatingFile(true);
  };

  const commitNewFile = async (name: string) => {
    if (!name || !session) { setCreatingFile(false); return; }
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
      if (session) await navigate(session.currentPath);
    } finally {
      setBusy(false);
    }
  };

  // ── Rename (inline) ────────────────────────────────────────────────────────

  const handleRenameStart = (path: string) => {
    if (!session) return;
    const entry = session.entries.find((e) => e.path === path);
    if (!entry) return;
    setRenaming(path);
    setRenameValue(entry.name);
    setSelected([path]);
  };

  const commitRename = async (overwrite = false) => {
    if (!renaming || !renameValue.trim()) { setRenaming(null); return; }
    const dir = renaming.split("/").slice(0, -1).join("/");
    const newPath = `${dir}/${renameValue.trim()}`;
    if (newPath === renaming) { setRenaming(null); return; }
    setBusy(true);
    setError(null);
    try {
      await sftpCommands.renameSftp(sessionId, renaming, newPath, overwrite);
      setRenaming(null);
      setSelected([]);
      if (session) await navigate(session.currentPath);
    } catch (e) {
      if (isAlreadyExistsError(e) && !overwrite) {
        setOverwriteConfirm({ message: formatError(e), onConfirm: () => { setOverwriteConfirm(null); void commitRename(true); } });
        return;
      }
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  // ── Cut / Paste (move) ─────────────────────────────────────────────────────

  const handleCut = () => {
    if (!session || selected.length === 0) return;
    setClipboard({ paths: selected, sourceDir: session.currentPath, mode: "cut" });
  };

  const handleCopy = () => {
    if (!session || selected.length === 0) return;
    setClipboard({ paths: selected, sourceDir: session.currentPath, mode: "copy" });
  };

  const handlePaste = async (overwrite = false, startIndex = 0) => {
    if (!clipboard || !session) return;
    setBusy(true);
    setError(null);
    let failed = 0;
    let firstError: string | null = null;
    for (let i = startIndex; i < clipboard.paths.length; i++) {
      const srcPath = clipboard.paths[i];
      const name = srcPath.split("/").pop() ?? srcPath;
      const destPath = joinPath(session.currentPath, name);
      // Skip if source and destination are identical (pasting into same folder with cut)
      if (srcPath === destPath) continue;
      try {
        if (clipboard.mode === "cut") {
          await sftpCommands.renameSftp(sessionId, srcPath, destPath, overwrite);
        } else {
          await sftpCommands.copySftpFile(sessionId, srcPath, destPath, overwrite);
        }
      } catch (e) {
        if (isAlreadyExistsError(e) && !overwrite) {
          setBusy(false);
          setOverwriteConfirm({ message: formatError(e), onConfirm: () => { setOverwriteConfirm(null); void handlePaste(true, i); } });
          return;
        }
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

  const cancelChmod = () => setChmodTarget(null);

  const commitChmod = async () => {
    if (!chmodTarget) return;
    setBusy(true);
    setError(null);
    try {
      await sftpCommands.chmodSftp(sessionId, chmodTarget.path, chmodMode);
      setChmodTarget(null);
      if (session) await navigate(session.currentPath);
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

  // ── Keyboard handler ───────────────────────────────────────────────────────

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
      setOverwriteConfirm(null);
      return;
    }
    if (!session) return;
    if (mod && e.key === "r") { e.preventDefault(); handleRefresh(); }
    if (mod && e.key === "a") {
      if (!isActive) return;
      e.preventDefault();
      setSelected(visibleEntries.map((entry) => entry.path));
    }
    if (e.shiftKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      if (!isActive) return;
      e.preventDefault();
      handleArrowSelect(e.key === "ArrowDown" ? 1 : -1);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []); // stable: ref always holds the latest handler

  // ── Computed values ────────────────────────────────────────────────────────

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

  const isBusy = busy || (session?.loadingEntries ?? false);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedEntries = useMemo(
    () => (session?.entries ?? []).filter((e) => selectedSet.has(e.path)),
    [session?.entries, selectedSet],
  );
  const selectedHasDir = useMemo(() => selectedEntries.some((e) => e.isDir), [selectedEntries]);

  return {
    session,
    isBusy,
    visibleEntries,
    selected,
    lastClickedPath,
    cursorPath,
    selectedEntries,
    selectedHasDir,
    clipboard,
    renaming,
    renameValue,
    creatingFolder,
    creatingFile,
    error,
    confirmingDelete,
    overwriteConfirm,
    cancelOverwriteConfirm: () => setOverwriteConfirm(null),
    transferProgress,
    transferByteProgress,
    chmodTarget,
    chmodMode,
    editingFiles,
    fileSyncedFlash,
    handleSelect,
    handleNavigateEntry,
    handleUp,
    handleRefresh,
    handleUpload: () => { void handleUpload(); },
    handleDownload: () => { void handleDownload(); },
    handleCancelTransfer,
    handleNewFolder,
    handleNewFile,
    handleDelete,
    commitDelete: () => { void commitDelete(); },
    handleRenameStart,
    setRenameValue,
    commitRename: () => { void commitRename(); },
    setRenaming,
    handleCut,
    handleCopy,
    handlePaste: () => { void handlePaste(); },
    handleChmod,
    setChmodMode,
    commitChmod: () => { void commitChmod(); },
    cancelChmod,
    handleOpenEdit: (path: string) => { void handleOpenEdit(path); },
    handleCloseEdit: (path: string) => { void handleCloseEdit(path); },
    handleUploadFromLocal: () => { void handleUploadFromLocal(); },
    handleDownloadToLocal: () => { void handleDownloadToLocal(); },
    handleUploadPaths: (localPaths: string[]) => { void handleUploadPaths(localPaths); },
    handleDownloadPaths: (remotePaths: string[]) => { void handleDownloadPaths(remotePaths); },
    commitNewFolder: (name: string) => { void commitNewFolder(name); },
    commitNewFile: (name: string) => { void commitNewFile(name); },
    setConfirmingDelete,
    setError,
    setCreatingFolder,
    setCreatingFile,
    navigate: (path: string) => { void navigate(path); },
  };
}
