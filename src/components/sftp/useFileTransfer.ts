import { useState, useEffect } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { sftpCommands } from "../../lib/commands/sftp";
import { formatError, isAlreadyExistsError, isCancelledError } from "../../lib/errors";
import { joinPath } from "../../lib/path";
import type { SftpSession } from "../../store/sftpStore";

interface FileTransferInput {
  sessionId: string;
  session: SftpSession | undefined;
  navigate: (path: string) => Promise<void>;
  selected: string[];
  localSelected: string[];
  localCurrentPath: string;
  refreshLocalPane?: () => void;
  showLocalPane: boolean;
  activePane: "local" | "remote";
  isBusy: boolean;
  setBusy: (v: boolean) => void;
  setError: (v: string | null) => void;
  setOverwriteConfirm: (v: { message: string; onConfirm: () => void } | null) => void;
}

interface FileTransferOutput {
  transferProgress: string | null;
  transferByteProgress: { bytes: number; total: number } | null;
  editingFiles: string[];
  fileSyncedFlash: string | null;
  handleUpload: () => void;
  handleDownload: () => void;
  handleCancelTransfer: () => void;
  handleUploadFromLocal: () => void;
  handleDownloadToLocal: () => void;
  handleUploadPaths: (localPaths: string[]) => void;
  handleDownloadPaths: (remotePaths: string[]) => void;
  handleOpenEdit: (path: string) => void;
  handleCloseEdit: (path: string) => void;
  handleDownloadAsZip: () => void;
  handleUnzipHere: (remotePath: string) => void;
}

export function useFileTransfer(input: FileTransferInput): FileTransferOutput {
  const {
    sessionId, session, navigate, selected,
    localSelected, localCurrentPath, refreshLocalPane, showLocalPane, activePane,
    isBusy, setBusy, setError, setOverwriteConfirm,
  } = input;

  const [transferProgress, setTransferProgress] = useState<string | null>(null);
  const [transferByteProgress, setTransferByteProgress] = useState<{ bytes: number; total: number } | null>(null);
  const [editingFiles, setEditingFiles] = useState<string[]>([]);
  const [fileSyncedFlash, setFileSyncedFlash] = useState<string | null>(null);

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

  useEffect(() => {
    if (!isBusy) setTransferByteProgress(null);
  }, [isBusy]);

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

  const handleDownloadAsZip = async () => {
    if (!session || selected.length === 0) return;
    const baseName =
      selected.length === 1
        ? (selected[0].split("/").pop()?.replace(/\.[^.]+$/, "") ?? "archive")
        : "archive";
    const localPath = await save({ defaultPath: `${baseName}.zip`, title: "Save ZIP archive as" });
    if (!localPath) return;
    const finalPath = localPath.endsWith(".zip") ? localPath : `${localPath}.zip`;
    setBusy(true);
    setTransferProgress("Creating ZIP archive…");
    setError(null);
    try {
      await sftpCommands.downloadSftpAsZip(sessionId, selected, finalPath);
      setTransferProgress(null);
    } catch (e) {
      setTransferProgress(null);
      if (!isCancelledError(e)) setError(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleUnzipHere = async (remotePath: string) => {
    if (!session) return;
    const lastSlash = remotePath.lastIndexOf("/");
    const remoteDir = lastSlash > 0 ? remotePath.slice(0, lastSlash) : "/";
    setBusy(true);
    const name = remotePath.split("/").pop() ?? remotePath;
    setTransferProgress(`Extracting ${name}…`);
    setError(null);
    try {
      await sftpCommands.unzipSftpFile(sessionId, remotePath, remoteDir);
      setTransferProgress(null);
      await navigate(session.currentPath);
    } catch (e) {
      setTransferProgress(null);
      if (!isCancelledError(e)) setError(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  return {
    transferProgress,
    transferByteProgress,
    editingFiles,
    fileSyncedFlash,
    handleUpload: () => { void handleUpload(); },
    handleDownload: () => { void handleDownload(); },
    handleCancelTransfer,
    handleUploadFromLocal: () => { void handleUploadFromLocal(); },
    handleDownloadToLocal: () => { void handleDownloadToLocal(); },
    handleUploadPaths: (localPaths: string[]) => { void handleUploadPaths(localPaths); },
    handleDownloadPaths: (remotePaths: string[]) => { void handleDownloadPaths(remotePaths); },
    handleOpenEdit: (path: string) => { void handleOpenEdit(path); },
    handleCloseEdit: (path: string) => { void handleCloseEdit(path); },
    handleDownloadAsZip: () => { void handleDownloadAsZip(); },
    handleUnzipHere: (path: string) => { void handleUnzipHere(path); },
  };
}
