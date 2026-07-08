import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSftpStore, type SftpSession } from "../../store/sftpStore";
import { formatError } from "../../lib/errors";
import { parentPath } from "../../lib/path";
import { arrowSelect } from "../../lib/rangeSelect";
import type { SortKey, SortDir } from "./SftpFileList";
import type { FileEntry } from "../../types/sftp";
import { useFileTransfer } from "./useFileTransfer";
import { useFileOperations } from "./useFileOperations";
import { useClipboard } from "./useClipboard";

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
  /** Whether this pane's tab is the one currently visible — gates ALL global shortcuts, since
   *  every open SFTP tab stays mounted and would otherwise react to keystrokes in the background. */
  isTabActive: boolean;
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
  clipboard: { paths: string[]; sourceDir: string; mode: "cut" | "copy" } | null;
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
  handleDownloadAsZip: () => void;
  handleUnzipHere: (path: string) => void;
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
  const { sessionId, showHidden, sortKey, sortDir, localCurrentPath, localSelected, activePane, showLocalPane, isActive, isTabActive, refreshLocalPane } = input;

  const session = useSftpStore((s) => s.sessions.find((t) => t.id === sessionId));
  const navigateTo = useSftpStore((s) => s.navigateTo);

  const [selected, setSelected] = useState<string[]>([]);
  const [lastClickedPath, setLastClickedPath] = useState<string | null>(null);
  const [cursorPath, setCursorPath] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overwriteConfirm, setOverwriteConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const navigate = useCallback(async (path: string): Promise<void> => {
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

  const isBusy = busy || (session?.loadingEntries ?? false);

  const transfer = useFileTransfer({
    sessionId, session, navigate, selected,
    localSelected, localCurrentPath, refreshLocalPane, showLocalPane, activePane,
    isBusy, setBusy, setError, setOverwriteConfirm,
  });

  const ops = useFileOperations({
    sessionId, session, navigate, selected, setSelected,
    setBusy, setError, setOverwriteConfirm,
  });

  const clip = useClipboard({
    sessionId, session, navigate, selected,
    setBusy, setError, setOverwriteConfirm,
  });

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

  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandlerRef.current = (e: KeyboardEvent) => {
    if (!isTabActive) return;
    if (document.activeElement?.tagName === "INPUT") return;
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "Escape") {
      ops.setRenaming(null);
      ops.setCreatingFolder(false);
      ops.setCreatingFile(false);
      ops.setConfirmingDelete(false);
      clip.clearClipboard();
      setError(null);
      setOverwriteConfirm(null);
      return;
    }
    if (!session) return;
    if (mod && e.key === "r") { e.preventDefault(); handleRefresh(); }
    if (mod && e.key === "ArrowUp") { e.preventDefault(); handleUp(); }
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
    clipboard: clip.clipboard,
    renaming: ops.renaming,
    renameValue: ops.renameValue,
    creatingFolder: ops.creatingFolder,
    creatingFile: ops.creatingFile,
    error,
    confirmingDelete: ops.confirmingDelete,
    overwriteConfirm,
    cancelOverwriteConfirm: () => setOverwriteConfirm(null),
    transferProgress: transfer.transferProgress,
    transferByteProgress: transfer.transferByteProgress,
    chmodTarget: ops.chmodTarget,
    chmodMode: ops.chmodMode,
    editingFiles: transfer.editingFiles,
    fileSyncedFlash: transfer.fileSyncedFlash,
    handleSelect,
    handleNavigateEntry,
    handleUp,
    handleRefresh,
    handleUpload: transfer.handleUpload,
    handleDownload: transfer.handleDownload,
    handleCancelTransfer: transfer.handleCancelTransfer,
    handleNewFolder: ops.handleNewFolder,
    handleNewFile: ops.handleNewFile,
    handleDelete: ops.handleDelete,
    commitDelete: ops.commitDelete,
    handleRenameStart: ops.handleRenameStart,
    setRenameValue: ops.setRenameValue,
    commitRename: ops.commitRename,
    setRenaming: ops.setRenaming,
    handleCut: clip.handleCut,
    handleCopy: clip.handleCopy,
    handlePaste: clip.handlePaste,
    handleChmod: ops.handleChmod,
    setChmodMode: ops.setChmodMode,
    commitChmod: ops.commitChmod,
    cancelChmod: ops.cancelChmod,
    handleOpenEdit: transfer.handleOpenEdit,
    handleCloseEdit: transfer.handleCloseEdit,
    handleDownloadAsZip: transfer.handleDownloadAsZip,
    handleUnzipHere: transfer.handleUnzipHere,
    handleUploadFromLocal: transfer.handleUploadFromLocal,
    handleDownloadToLocal: transfer.handleDownloadToLocal,
    handleUploadPaths: transfer.handleUploadPaths,
    handleDownloadPaths: transfer.handleDownloadPaths,
    commitNewFolder: ops.commitNewFolder,
    commitNewFile: ops.commitNewFile,
    setConfirmingDelete: ops.setConfirmingDelete,
    setError,
    setCreatingFolder: ops.setCreatingFolder,
    setCreatingFile: ops.setCreatingFile,
    navigate: (path: string) => { void navigate(path); },
  };
}
