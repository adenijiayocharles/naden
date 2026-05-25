import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { useSftpStore, type SftpSession } from "../../store/sftpStore";
import { sftpCommands } from "../../lib/tauriCommands";
import { formatError } from "../../lib/errors";
import { joinPath, parentPath } from "../../lib/path";
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
}

interface RemotePaneOutput {
  session: SftpSession | undefined;
  isBusy: boolean;
  visibleEntries: FileEntry[];
  selected: string[];
  lastClickedPath: string | null;
  selectedEntries: FileEntry[];
  selectedHasDir: boolean;
  clipboard: Clipboard | null;
  renaming: string | null;
  renameValue: string;
  creatingFolder: boolean;
  creatingFile: boolean;
  error: string | null;
  confirmingDelete: boolean;
  transferProgress: string | null;
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
  commitNewFolder: (name: string) => void;
  commitNewFile: (name: string) => void;
  setConfirmingDelete: (v: boolean) => void;
  setError: (v: string | null) => void;
  setCreatingFolder: (v: boolean) => void;
  setCreatingFile: (v: boolean) => void;
  navigate: (path: string) => void;
}

export function useRemotePane(input: RemotePaneInput): RemotePaneOutput {
  const { sessionId, showHidden, sortKey, sortDir, localCurrentPath, localSelected, activePane, showLocalPane } = input;

  const session = useSftpStore((s) => s.sessions.find((t) => t.id === sessionId));
  const navigateTo = useSftpStore((s) => s.navigateTo);

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

  // Listen for live-edit sync events
  useEffect(() => {
    const unlisten = listen<string>(`sftp:file_synced:${sessionId}`, ({ payload }) => {
      const name = payload.split("/").pop() ?? payload;
      setFileSyncedFlash(`Synced: ${name}`);
      setTimeout(() => setFileSyncedFlash(null), 3000);
    });
    return () => { void unlisten.then((fn) => fn()); };
  }, [sessionId]);

  const navigate = useCallback(async (path: string) => {
    setSelected([]);
    setLastClickedPath(null);
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
    if (!session) return;
    const selectedEntries = session.entries.filter((e) => selected.includes(e.path));
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

  const handleUpload = async () => {
    if (showLocalPane && activePane === "local") {
      await handleUploadFromLocal();
      return;
    }
    if (!session) return;
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
    if (showLocalPane && activePane === "local") {
      await handleDownloadToLocal();
      return;
    }
    if (!session) return;
    const selectedEntries = session.entries.filter((e) => selected.includes(e.path));
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
      if (session) await navigate(session.currentPath);
    } catch (e) {
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

  const handlePaste = async () => {
    if (!clipboard || !session) return;
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
  const selectedEntries = (session?.entries ?? []).filter((e) => selected.includes(e.path));
  const selectedHasDir = selectedEntries.some((e) => e.isDir);

  return {
    session,
    isBusy,
    visibleEntries,
    selected,
    lastClickedPath,
    selectedEntries,
    selectedHasDir,
    clipboard,
    renaming,
    renameValue,
    creatingFolder,
    creatingFile,
    error,
    confirmingDelete,
    transferProgress,
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
    commitNewFolder: (name: string) => { void commitNewFolder(name); },
    commitNewFile: (name: string) => { void commitNewFile(name); },
    setConfirmingDelete,
    setError,
    setCreatingFolder,
    setCreatingFile,
    navigate: (path: string) => { void navigate(path); },
  };
}
