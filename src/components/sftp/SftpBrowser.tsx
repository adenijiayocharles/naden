import { useState } from "react";
import { useSftpStore } from "../../store/sftpStore";
import type { SortKey, SortDir } from "./SftpFileList";
import SftpFileList from "./SftpFileList";
import SftpToolbar, { PathBar } from "./SftpToolbar";
import LocalFileBrowser from "./LocalFileBrowser";
import { ConnectingOverlay, ErrorOverlay } from "../shared/ConnectionOverlay";
import InlineCreateInput from "./InlineCreateInput";
import DeleteConfirmBanner from "./DeleteConfirmBanner";
import ErrorBanner from "./ErrorBanner";
import ChmodDialog from "./ChmodDialog";
import { useRemotePane } from "./useRemotePane";

interface Props {
  sessionId: string;
}

export default function SftpBrowser({ sessionId }: Props) {
  const closeSession = useSftpStore((s) => s.closeSession);
  const reconnectSession = useSftpStore((s) => s.reconnectSession);

  // Viewing options — separate state per pane
  const [showHidden, setShowHidden] = useState(true);       // remote
  const [showHiddenLocal, setShowHiddenLocal] = useState(true); // local
  const [localNewFolderTrigger, setLocalNewFolderTrigger] = useState(0);
  const [localNewFileTrigger, setLocalNewFileTrigger] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Local pane state
  const [showLocalPane, setShowLocalPane] = useState(false);
  const [localSelected, setLocalSelected] = useState<string[]>([]);
  const [localCurrentPath, setLocalCurrentPath] = useState("");
  const [activePane, setActivePane] = useState<"local" | "remote">("remote");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const {
    session,
    isBusy,
    visibleEntries,
    selected,
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
    syncing,
    syncProgress,
    handleSelect,
    handleNavigateEntry,
    handleUp,
    handleRefresh,
    handleUpload,
    handleDownload,
    handleNewFolder: handleRemoteNewFolder,
    handleNewFile: handleRemoteNewFile,
    handleDelete,
    commitDelete,
    handleRenameStart,
    setRenameValue,
    commitRename,
    setRenaming,
    handleCut,
    handleCopy,
    handlePaste,
    handleChmod,
    setChmodMode,
    commitChmod,
    cancelChmod,
    handleOpenEdit,
    handleCloseEdit,
    handleSyncFolder,
    handleUploadFromLocal,
    handleDownloadToLocal,
    commitNewFolder,
    commitNewFile,
    setConfirmingDelete,
    setError,
    setCreatingFolder,
    setCreatingFile,
    navigate,
  } = useRemotePane({
    sessionId,
    showHidden,
    sortKey,
    sortDir,
    localCurrentPath,
    localSelected,
    activePane,
    showLocalPane,
  });

  if (!session) return null;

  const handleNewFolder = () => {
    if (showLocalPane && activePane === "local") {
      setLocalNewFolderTrigger((n) => n + 1);
    } else {
      handleRemoteNewFolder();
    }
  };

  const handleNewFile = () => {
    if (showLocalPane && activePane === "local") {
      setLocalNewFileTrigger((n) => n + 1);
    } else {
      handleRemoteNewFile();
    }
  };

  const handleSelectWithPane = (path: string, meta: boolean, shift: boolean) => {
    setActivePane("remote");
    handleSelect(path, meta, shift);
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
        onPaste={handlePaste}
        showHidden={showLocalPane && activePane === "local" ? showHiddenLocal : showHidden}
        onToggleHidden={() => {
          if (showLocalPane && activePane === "local") setShowHiddenLocal((v) => !v);
          else setShowHidden((v) => !v);
        }}
        busy={isBusy || syncing}
        onNavigateTo={(path) => { navigate(path); }}
        onNavigateUp={handleUp}
        onRefresh={handleRefresh}
        onUpload={handleUpload}
        onDownload={handleDownload}
        onNewFolder={handleNewFolder}
        onNewFile={handleNewFile}
        editingCount={editingFiles.length}
        onSync={handleSyncFolder}
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
                onClick={handleUploadFromLocal}
                disabled={!canUploadFromLocal}
                title="Upload selected local files to remote"
                className="p-1.5 rounded text-muted hover:text-white hover:bg-surface-4 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
              >
                →
              </button>
              <button
                onClick={handleDownloadToLocal}
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
            onNavigateTo={(p) => { navigate(p); }}
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
        <DeleteConfirmBanner count={selected.length} onConfirm={commitDelete} onCancel={() => setConfirmingDelete(false)} />
      )}

      {/* New folder input */}
      {creatingFolder && <InlineCreateInput label="New folder:" placeholder="folder-name" onCommit={commitNewFolder} onCancel={() => setCreatingFolder(false)} />}

      {/* New file input */}
      {creatingFile && <InlineCreateInput label="New file:" placeholder="filename.txt" onCommit={commitNewFile} onCancel={() => setCreatingFile(false)} />}

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
                onClick={() => { handleCloseEdit(p); }}
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
        onSelect={handleSelectWithPane}
        onNavigate={handleNavigateEntry}
        hasClipboard={clipboard !== null}
        onRenameStart={handleRenameStart}
        onRenameChange={setRenameValue}
        onRenameCommit={commitRename}
        onRenameCancel={() => setRenaming(null)}
        onCut={handleCut}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onDelete={handleDelete}
        onEdit={handleOpenEdit}
        onChmod={handleChmod}
      />

        </div> {/* end remote pane */}
      </div> {/* end flex row */}

      {/* Chmod dialog */}
      <ChmodDialog
        target={chmodTarget}
        mode={chmodMode}
        disabled={isBusy}
        onModeChange={setChmodMode}
        onApply={commitChmod}
        onCancel={cancelChmod}
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
