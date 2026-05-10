import { useState } from "react";
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

export default function SftpBrowser({ sessionId }: Props) {
  const session = useSftpStore((s) => s.sessions.find((t) => t.id === sessionId));
  const navigateTo = useSftpStore((s) => s.navigateTo);
  const closeSession = useSftpStore((s) => s.closeSession);

  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [transferProgress, setTransferProgress] = useState<string | null>(null);

  if (!session) return null;

  const selectedEntry = session.entries.find((e) => e.path === selected) ?? null;
  const isBusy = busy || session.loadingEntries;

  const navigate = async (path: string) => {
    setSelected(null);
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

  const handleUpload = async () => {
    const result = await open({ multiple: false, title: "Choose file to upload" });
    if (typeof result !== "string") return;
    const localPath = result;
    const fileName = localPath.split("/").pop() ?? "upload";
    const remotePath = `${session.currentPath}/${fileName}`;

    setBusy(true);
    setTransferProgress(`Uploading ${fileName}…`);
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
    if (!selectedEntry || selectedEntry.isDir) return;
    const fileName = selectedEntry.name;
    const localPath = await save({ defaultPath: fileName, title: "Save file as" });
    if (!localPath) return;

    setBusy(true);
    setTransferProgress(`Downloading ${fileName}…`);
    setError(null);
    try {
      await sftpCommands.downloadSftpFile(sessionId, selectedEntry.path, localPath);
      setTransferProgress(null);
    } catch (e) {
      setError(formatError(e));
      setTransferProgress(null);
    } finally {
      setBusy(false);
    }
  };

  const handleNewFolder = () => {
    setCreatingFolder(true);
    setFolderName("");
  };

  const commitNewFolder = async () => {
    if (!folderName.trim()) { setCreatingFolder(false); return; }
    const path = `${session.currentPath}/${folderName.trim()}`;
    setBusy(true);
    setError(null);
    try {
      await sftpCommands.mkdirSftp(sessionId, path);
      setCreatingFolder(false);
      await navigate(session.currentPath);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = () => {
    if (!selected) return;
    setConfirmingDelete(true);
  };

  const commitDelete = async () => {
    if (!selected) return;
    setConfirmingDelete(false);
    setBusy(true);
    setError(null);
    try {
      await sftpCommands.deleteSftp(sessionId, selected);
      setSelected(null);
      await navigate(session.currentPath);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleRename = () => {
    if (!selected || !selectedEntry) return;
    setRenaming(selected);
    setRenameValue(selectedEntry.name);
  };

  const commitRename = async () => {
    if (!renaming || !renameValue.trim()) { setRenaming(null); return; }
    const dir = renaming.split("/").slice(0, -1).join("/");
    const newPath = `${dir}/${renameValue.trim()}`;
    setBusy(true);
    setError(null);
    try {
      await sftpCommands.renameSftp(sessionId, renaming, newPath);
      setRenaming(null);
      setSelected(null);
      await navigate(session.currentPath);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  const isConnecting = session.status === "connecting";
  const isError = session.status === "error";

  return (
    <div className="relative h-full w-full flex flex-col bg-surface-0">
      <SftpToolbar
        currentPath={session.currentPath}
        selectedPath={selected}
        selectedIsDir={selectedEntry?.isDir ?? false}
        busy={isBusy}
        onNavigateTo={(path) => { navigate(path).catch(() => {}); }}
        onNavigateUp={handleUp}
        onRefresh={handleRefresh}
        onUpload={() => { void handleUpload(); }}
        onDownload={() => { void handleDownload(); }}
        onNewFolder={handleNewFolder}
        onDelete={handleDelete}
        onRename={handleRename}
      />

      {/* Inline delete confirmation */}
      {confirmingDelete && (
        <div className="px-4 py-2 bg-red-950/30 border-b border-red-900/40 flex items-center gap-3 text-xs">
          <span className="text-red-300 flex-1">
            Delete <span className="font-semibold font-mono">{selectedEntry?.name}</span>? This cannot be undone.
          </span>
          <button
            onClick={() => { void commitDelete(); }}
            className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded transition-colors font-semibold"
          >
            Delete
          </button>
          <button
            onClick={() => setConfirmingDelete(false)}
            className="text-faint hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Inline rename input */}
      {renaming && (
        <div className="px-4 py-2 bg-surface-1 border-b border-stroke-subtle flex items-center gap-2">
          <span className="text-xs text-muted">Rename to:</span>
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitRename();
              if (e.key === "Escape") setRenaming(null);
            }}
            className="flex-1 h-8 bg-surface-3 border border-[#333] rounded px-2 text-sm text-white outline-none focus:border-accent font-mono"
          />
          <button onClick={() => { void commitRename(); }} className="text-xs text-accent-fg px-2">OK</button>
          <button onClick={() => setRenaming(null)} className="text-xs text-faint px-2">Cancel</button>
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

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-950/40 border-b border-red-900/50 text-xs text-red-400 flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-400 ml-4">×</button>
        </div>
      )}

      {/* Transfer progress */}
      {transferProgress && (
        <div className="px-4 py-2 bg-[#0f1a0a] border-b border-stroke-subtle flex items-center gap-3 text-xs text-muted">
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
        onSelect={setSelected}
        onNavigate={handleNavigateEntry}
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
          onClose={() => { void closeSession(sessionId); }}
        />
      )}
    </div>
  );
}
