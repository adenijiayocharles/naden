import { useState, useEffect } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useSftpStore } from "../../store/sftpStore";
import { sftpCommands } from "../../lib/tauriCommands";
import { formatError } from "../../lib/errors";
import SftpFileList from "./SftpFileList";
import SftpToolbar from "./SftpToolbar";
import { ConnectingOverlay, ErrorOverlay } from "../shared/ConnectionOverlay";

interface Props {
  sessionId: string;
}

interface Clipboard {
  paths: string[];
  sourceDir: string;
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
  const [folderName, setFolderName] = useState("");
  const [creatingFile, setCreatingFile] = useState(false);
  const [fileName, setFileName] = useState("");

  // UI state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [transferProgress, setTransferProgress] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Let inputs handle their own Escape via onKeyDown; only cancel
      // non-input state here so we don't fire twice for inline inputs.
      if (document.activeElement?.tagName === "INPUT") return;
      setRenaming(null);
      setCreatingFolder(false);
      setCreatingFile(false);
      setConfirmingDelete(false);
      setClipboard(null);
      setError(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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
    const parent = session.currentPath.split("/").slice(0, -1).join("/") || "/";
    navigate(parent).catch(() => {});
  };

  const handleRefresh = () => navigate(session.currentPath).catch(() => {});

  // ── Selection ──────────────────────────────────────────────────────────────

  const handleSelect = (path: string, meta: boolean, shift: boolean) => {
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
    const result = await open({ multiple: false, title: "Choose file to upload" });
    if (typeof result !== "string") return;
    const localPath = result;
    const remoteName = localPath.split("/").pop() ?? "upload";
    const remotePath = `${session.currentPath}/${remoteName}`;
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
        await sftpCommands.downloadSftpFile(sessionId, file.path, `${folder}/${file.name}`);
      } catch (e) {
        setError(formatError(e));
        break;
      }
    }
    setTransferProgress(null);
    setBusy(false);
  };

  // ── New Folder / New File ──────────────────────────────────────────────────

  const handleNewFolder = () => { setCreatingFolder(true); setFolderName(""); };

  const commitNewFolder = async () => {
    if (!folderName.trim()) { setCreatingFolder(false); return; }
    setBusy(true);
    setError(null);
    try {
      await sftpCommands.mkdirSftp(sessionId, `${session.currentPath}/${folderName.trim()}`);
      setCreatingFolder(false);
      await navigate(session.currentPath);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleNewFile = () => { setCreatingFile(true); setFileName(""); };

  const commitNewFile = async () => {
    if (!fileName.trim()) { setCreatingFile(false); return; }
    setBusy(true);
    setError(null);
    try {
      await sftpCommands.touchSftpFile(sessionId, `${session.currentPath}/${fileName.trim()}`);
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
    setBusy(false);
  };

  // ── Rename (inline) ────────────────────────────────────────────────────────

  const handleRenameStart = (path: string) => {
    const entry = session.entries.find((e) => e.path === path);
    if (!entry) return;
    setRenaming(path);
    setRenameValue(entry.name);
    setSelected([path]);
  };

  const handleRenameFromToolbar = () => {
    if (selected.length === 1) handleRenameStart(selected[0]);
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
    setClipboard({ paths: selected, sourceDir: session.currentPath });
  };

  const handlePaste = async () => {
    if (!clipboard) return;
    setBusy(true);
    setError(null);
    let failed = 0;
    for (const srcPath of clipboard.paths) {
      const name = srcPath.split("/").pop() ?? srcPath;
      const destPath = `${session.currentPath}/${name}`;
      try {
        await sftpCommands.renameSftp(sessionId, srcPath, destPath);
      } catch {
        failed++;
      }
    }
    if (failed > 0) setError(`${failed} item(s) could not be moved.`);
    setClipboard(null);
    setSelected([]);
    await navigate(session.currentPath);
    setBusy(false);
  };

  const isConnecting = session.status === "connecting";
  const isError = session.status === "error";

  return (
    <div className="relative h-full w-full flex flex-col bg-surface-0">
      <SftpToolbar
        currentPath={session.currentPath}
        selectedCount={selected.length}
        selectedHasDir={selectedHasDir}
        hasClipboard={clipboard !== null}
        busy={isBusy}
        onNavigateTo={(path) => { navigate(path).catch(() => {}); }}
        onNavigateUp={handleUp}
        onRefresh={handleRefresh}
        onUpload={() => { void handleUpload(); }}
        onDownload={() => { void handleDownload(); }}
        onNewFolder={handleNewFolder}
        onNewFile={handleNewFile}
        onDelete={handleDelete}
        onRename={handleRenameFromToolbar}
        onCut={handleCut}
        onPaste={() => { void handlePaste(); }}
      />

      {/* Inline delete confirmation */}
      {confirmingDelete && (
        <div className="px-4 py-2 bg-red-950/30 border-b border-red-900/40 flex items-center gap-3 text-xs">
          <span className="text-red-300 flex-1">
            Delete <span className="font-semibold">{selected.length} item{selected.length > 1 ? "s" : ""}</span>? This cannot be undone.
          </span>
          <button onClick={() => { void commitDelete(); }} className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded transition-colors font-semibold">
            Delete
          </button>
          <button onClick={() => setConfirmingDelete(false)} className="text-faint hover:text-white transition-colors">
            Cancel
          </button>
        </div>
      )}

      {/* New folder input */}
      {creatingFolder && (
        <div className="px-4 py-2 bg-surface-1 border-b border-stroke-subtle flex items-center gap-2">
          <span className="text-xs text-muted">New folder:</span>
          <input
            autoFocus
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitNewFolder();
              if (e.key === "Escape") setCreatingFolder(false);
            }}
            placeholder="folder-name"
            className="flex-1 bg-surface-3 border border-[#333] rounded px-2 py-1 text-sm text-white outline-none focus:border-accent font-mono placeholder-[#444]"
          />
          <button onClick={() => { void commitNewFolder(); }} className="text-xs text-accent-fg px-2">Create</button>
          <button onClick={() => setCreatingFolder(false)} className="text-xs text-faint px-2">Cancel</button>
        </div>
      )}

      {/* New file input */}
      {creatingFile && (
        <div className="px-4 py-2 bg-surface-1 border-b border-stroke-subtle flex items-center gap-2">
          <span className="text-xs text-muted">New file:</span>
          <input
            autoFocus
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitNewFile();
              if (e.key === "Escape") setCreatingFile(false);
            }}
            placeholder="filename.txt"
            className="flex-1 bg-surface-3 border border-[#333] rounded px-2 py-1 text-sm text-white outline-none focus:border-accent font-mono placeholder-[#444]"
          />
          <button onClick={() => { void commitNewFile(); }} className="text-xs text-accent-fg px-2">Create</button>
          <button onClick={() => setCreatingFile(false)} className="text-xs text-faint px-2">Cancel</button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-950/40 border-b border-red-900/50 text-xs text-red-400 flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-400 ml-4">×</button>
        </div>
      )}

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

      <SftpFileList
        entries={session.entries}
        selected={selected}
        renaming={renaming}
        renameValue={renameValue}
        onSelect={handleSelect}
        onNavigate={handleNavigateEntry}
        onRenameStart={handleRenameStart}
        onRenameChange={setRenameValue}
        onRenameCommit={() => { void commitRename(); }}
        onRenameCancel={() => setRenaming(null)}
      />

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
