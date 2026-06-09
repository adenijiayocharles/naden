import { useState, useEffect, useRef } from "react";
import { useSftpStore } from "../../store/sftpStore";
import { useServerStore } from "../../store/serverStore";
import { sftpCommands } from "../../lib/tauriCommands";
import { formatError } from "../../lib/errors";
import type { SortKey, SortDir } from "./SftpFileList";
import SftpFileList from "./SftpFileList";
import SftpToolbar, { PathBar } from "./SftpToolbar";
import LocalFileBrowser from "./LocalFileBrowser";
import { ConnectingOverlay, ErrorOverlay } from "../shared/ConnectionOverlay";
import InlineCreateInput from "./InlineCreateInput";
import ConfirmDeleteModal from "../shared/ConfirmDeleteModal";
import ErrorBanner from "./ErrorBanner";
import ChmodDialog from "./ChmodDialog";
import { useRemotePane } from "./useRemotePane";

interface Props {
  sessionId: string;
}

export default function SftpBrowser({ sessionId }: Props) {
  const closeSession = useSftpStore((s) => s.closeSession);
  const reconnectSession = useSftpStore((s) => s.reconnectSession);
  const openHiddenSession = useSftpStore((s) => s.openHiddenSession);
  const allServers = useServerStore((s) => s.servers);

  // Viewing options — separate state per pane
  const [showHidden, setShowHidden] = useState(false);
  const [localNewFolderTrigger, setLocalNewFolderTrigger] = useState(0);
  const [localNewFileTrigger, setLocalNewFileTrigger] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [sortKeyPeer, setSortKeyPeer] = useState<SortKey>("name");
  const [sortDirPeer, setSortDirPeer] = useState<SortDir>("asc");

  // Pane layout state
  const [showLocalPane, setShowLocalPane] = useState(false);
  // "local" or a serverId — single dropdown controls the left pane content
  const [leftPaneSelection, setLeftPaneSelection] = useState<string>("local");
  // Resolved sessionId for the peer once a session is open for the selected server
  const [peerSessionId, setPeerSessionId] = useState<string | null>(null);

  // Targeted boolean — only changes when the peer session is added or removed,
  // not on every entries/status update. Declared after peerSessionId so the
  // closure captures the already-initialised state variable.
  const peerSessionExists = useSftpStore((s) =>
    peerSessionId !== null && s.sessions.some((sess) => sess.id === peerSessionId),
  );
  const [localSelected, setLocalSelected] = useState<string[]>([]);
  const [localCurrentPath, setLocalCurrentPath] = useState("");
  const [activePane, setActivePane] = useState<"local" | "remote">("remote");
  const [remoteDragCount, setRemoteDragCount] = useState(0);

  // Cross-session transfer state
  const [crossTransferBusy, setCrossTransferBusy] = useState(false);
  const [crossTransferProgress, setCrossTransferProgress] = useState<string | null>(null);

  // Reset to local if the peer session is removed from the store externally
  useEffect(() => {
    if (!peerSessionId) return;
    if (!peerSessionExists) {
      setLeftPaneSelection("local");
      setPeerSessionId(null);
    }
  }, [peerSessionId, peerSessionExists]);

  // Close the hidden peer session when this SftpBrowser unmounts
  const peerSessionIdRef = useRef<string | null>(null);
  peerSessionIdRef.current = peerSessionId;
  const closeSessionRef = useRef(closeSession);
  closeSessionRef.current = closeSession;
  useEffect(() => {
    return () => {
      const id = peerSessionIdRef.current;
      if (id) void closeSessionRef.current(id);
    };
  }, []);

  const leftPaneIsLocal = leftPaneSelection === "local";
  // "__none__" sentinel: prevents the peer useRemotePane from subscribing to the
  // primary session when no peer is open, which doubles subscription traffic.
  const effectivePeerId = peerSessionId ?? "__none__";

  // Generation counter guards against rapid dropdown changes: if the user
  // switches servers before openHiddenSession resolves, the stale result is
  // discarded and its session is immediately closed.
  const leftPaneChangeGenRef = useRef(0);

  const handleLeftPaneChange = async (value: string) => {
    const gen = ++leftPaneChangeGenRef.current;
    const prevId = peerSessionId;
    setPeerSessionId(null);
    setLeftPaneSelection(value);
    setActivePane("local");
    setShowLocalPane(true);
    if (prevId) void closeSession(prevId);

    if (value === "local") return;

    const server = allServers.find((s) => s.id === value);
    if (!server) return;
    try {
      const newId = await openHiddenSession(value, server.displayName);
      if (gen === leftPaneChangeGenRef.current) {
        setPeerSessionId(newId);
      } else {
        // A newer selection arrived while this one was connecting — discard.
        void closeSession(newId);
      }
    } catch {
      if (gen === leftPaneChangeGenRef.current) {
        setLeftPaneSelection("local");
      }
    }
  };

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const handlePeerSort = (key: SortKey) => {
    if (key === sortKeyPeer) setSortDirPeer((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKeyPeer(key); setSortDirPeer("asc"); }
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
    transferByteProgress,
    chmodTarget,
    chmodMode,
    editingFiles,
    fileSyncedFlash,
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
    handleUploadFromLocal,
    handleDownloadToLocal,
    handleUploadPaths,
    handleDownloadPaths,
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

  // Peer remote pane — always instantiated (hooks can't be conditional).
  // Falls back to own sessionId when no peer is selected so the hook stays valid,
  // but we never render or interact with peerPane in that state.
  const peerPane = useRemotePane({
    sessionId: effectivePeerId,
    showHidden,
    sortKey: sortKeyPeer,
    sortDir: sortDirPeer,
    localCurrentPath: "",
    localSelected: [],
    activePane: "remote",
    showLocalPane: false,
  });

  if (!session) return null;

  const validPeer = !leftPaneIsLocal && !!peerSessionId && peerSessionId !== sessionId && !!peerPane.session;
  const otherServers = allServers.filter((s) => s.id !== session.serverId);

  // ── Transfer capability flags ──────────────────────────────────────────────

  const canUploadFromLocal =
    leftPaneIsLocal && activePane === "local" && localSelected.length > 0 && !isBusy;
  const canDownloadToLocal =
    leftPaneIsLocal && activePane === "remote" && selectedEntries.some((e) => !e.isDir) && !!localCurrentPath && !isBusy;

  const canCopyPeerToRemote =
    validPeer && peerPane.selectedEntries.some((e) => !e.isDir) && !crossTransferBusy && !isBusy;
  const canCopyRemoteToPeer =
    validPeer && selectedEntries.some((e) => !e.isDir) && !crossTransferBusy && !peerPane.isBusy;

  // ── Cross-session transfer handlers ───────────────────────────────────────

  const handleCopyPeerToRemote = async () => {
    // Guard on peerSessionId directly — effectivePeerId may be "__none__" if
    // called via a stale closure after the peer is cleared.
    if (!session || !peerPane.session || !peerSessionId) return;
    const files = peerPane.selectedEntries.filter((e) => !e.isDir);
    if (files.length === 0) return;
    setCrossTransferBusy(true);
    setCrossTransferProgress(null);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setCrossTransferProgress(
          files.length > 1 ? `Copying ${file.name} (${i + 1}/${files.length})…` : `Copying ${file.name}…`,
        );
        await sftpCommands.crossCopySftpFiles(peerSessionId, [file.path], sessionId, session.currentPath);
      }
      setCrossTransferProgress(null);
      handleRefresh();
    } catch (e) {
      setError(formatError(e));
      setCrossTransferProgress(null);
    } finally {
      setCrossTransferBusy(false);
    }
  };

  const handleCopyRemoteToPeer = async () => {
    if (!session || !peerPane.session || !peerSessionId) return;
    const files = selectedEntries.filter((e) => !e.isDir);
    if (files.length === 0) return;
    setCrossTransferBusy(true);
    setCrossTransferProgress(null);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setCrossTransferProgress(
          files.length > 1 ? `Copying ${file.name} (${i + 1}/${files.length})…` : `Copying ${file.name}…`,
        );
        await sftpCommands.crossCopySftpFiles(sessionId, [file.path], peerSessionId, peerPane.session.currentPath);
      }
      setCrossTransferProgress(null);
      peerPane.handleRefresh();
    } catch (e) {
      setError(formatError(e));
      setCrossTransferProgress(null);
    } finally {
      setCrossTransferBusy(false);
    }
  };

  // ── Toolbar handler wrappers ───────────────────────────────────────────────

  const handleNewFolder = () => {
    if (showLocalPane && activePane === "local") {
      if (leftPaneIsLocal) setLocalNewFolderTrigger((n) => n + 1);
      else peerPane.handleNewFolder();
    } else {
      handleRemoteNewFolder();
    }
  };

  const handleNewFile = () => {
    if (showLocalPane && activePane === "local") {
      if (leftPaneIsLocal) setLocalNewFileTrigger((n) => n + 1);
      else peerPane.handleNewFile();
    } else {
      handleRemoteNewFile();
    }
  };

  const handleSelectWithPane = (path: string, meta: boolean, shift: boolean) => {
    setActivePane("remote");
    handleSelect(path, meta, shift);
  };

  const handlePeerSelectWithPane = (path: string, meta: boolean, shift: boolean) => {
    setActivePane("local");
    peerPane.handleSelect(path, meta, shift);
  };

  const handleToggleHidden = () => setShowHidden((v) => !v);

  const isConnecting = session.status === "connecting";
  const isError = session.status === "error";

  const activeLabel = transferProgress ?? crossTransferProgress ?? (transferByteProgress ? "Transferring…" : null);
  const activeBytes = transferByteProgress;
  const pct = activeBytes && activeBytes.total > 0
    ? Math.round((activeBytes.bytes / activeBytes.total) * 100)
    : null;

  return (
    <div className="relative h-full w-full flex flex-col bg-surface-1">
      <SftpToolbar
        currentPath={session.currentPath}
        selectedCount={selected.length}
        selectedHasDir={selectedHasDir}
        hasClipboard={clipboard !== null}
        clipboardMode={clipboard?.mode ?? null}
        onPaste={handlePaste}
        showHidden={showHidden}
        onToggleHidden={handleToggleHidden}
        busy={isBusy}
        onNavigateTo={(path) => { navigate(path); }}
        onNavigateUp={handleUp}
        onRefresh={handleRefresh}
        onUpload={handleUpload}
        onDownload={handleDownload}
        onNewFolder={handleNewFolder}
        onNewFile={handleNewFile}
        editingCount={editingFiles.length}
        showLocalPane={showLocalPane}
        onToggleLocalPane={() => setShowLocalPane((v) => !v)}
        activePane={activePane}
        localSelectedCount={localSelected.length}
        leftPaneSelection={leftPaneSelection}
        onLeftPaneChange={(v) => { void handleLeftPaneChange(v); }}
        leftPaneServers={otherServers}
      />

      {/* Transfer progress bar — spans full width, only visible during transfers */}
      {activeLabel && (
        <div className="shrink-0 px-4 py-2 bg-surface-2 border-b border-stroke-subtle flex items-center gap-3">
          <span className="text-meta text-muted truncate flex-1 min-w-0">{activeLabel}</span>
          {pct !== null && (
            <span className="text-meta text-muted tabular-nums shrink-0">{pct}%</span>
          )}
          <div className="w-40 shrink-0 h-1.5 bg-surface-4 rounded-full overflow-hidden">
            {pct !== null ? (
              <div
                className="h-full bg-accent-fg rounded-full transition-[width] duration-100"
                style={{ width: `${pct}%` }}
              />
            ) : (
              <div className="h-full w-full bg-accent-fg/40 animate-pulse rounded-full" />
            )}
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Left pane */}
        {showLocalPane && (
          <>
            <div className="flex-1 min-w-0 border-r border-stroke-subtle flex flex-col">
              {/* Peer navigation header — only shown when a remote session is active */}
              {!leftPaneIsLocal && validPeer && (
                <div className="flex items-center gap-2 px-3 py-2 border-b border-stroke-subtle bg-surface-1 shrink-0">
                  <button
                    onClick={peerPane.handleUp}
                    disabled={peerPane.isBusy || peerPane.session?.currentPath === "/"}
                    className="p-1.5 rounded text-muted hover:text-white hover:bg-surface-3 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Go up (peer)"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 16 16" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12V4M4 8l4-4 4 4" />
                    </svg>
                  </button>
                  <PathBar
                    path={peerPane.session?.currentPath ?? ""}
                    busy={peerPane.isBusy}
                    onNavigateTo={(p) => { peerPane.navigate(p); }}
                  />
                  <button
                    onClick={peerPane.handleRefresh}
                    disabled={peerPane.isBusy}
                    className="p-1.5 rounded text-muted hover:text-white hover:bg-surface-3 transition-colors disabled:opacity-30"
                    title="Refresh (peer)"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Left pane body */}
              {leftPaneIsLocal ? (
                <LocalFileBrowser
                  onSelectedChange={setLocalSelected}
                  onPathChange={setLocalCurrentPath}
                  onActivate={() => setActivePane("local")}
                  showHidden={showHidden}
                  newFolderTrigger={localNewFolderTrigger}
                  newFileTrigger={localNewFileTrigger}
                  onDropRemotePaths={handleDownloadPaths}
                />
              ) : (
                <div className="flex flex-col flex-1 min-h-0" onClick={() => setActivePane("local")}>
                  {!validPeer ? (
                    <div className="flex-1 flex items-center justify-center text-muted text-sm px-6 text-center">
                      {!peerSessionId
                        ? "Opening session…"
                        : peerPane.session?.status === "connecting"
                          ? "Connecting…"
                          : peerPane.session?.status === "error"
                            ? (peerPane.session.errorMessage ?? "Connection error")
                            : "Session unavailable"}
                    </div>
                  ) : (
                    <>
                      {peerPane.confirmingDelete && (
                        <ConfirmDeleteModal
                          title={`Delete ${peerPane.selected.length} item${peerPane.selected.length !== 1 ? "s" : ""}?`}
                          description="These files will be permanently deleted. This cannot be undone."
                          onConfirm={peerPane.commitDelete}
                          onCancel={() => { peerPane.setConfirmingDelete(false); }}
                        />
                      )}
                      {peerPane.creatingFolder && (
                        <InlineCreateInput
                          label="New folder:"
                          placeholder="folder-name"
                          onCommit={peerPane.commitNewFolder}
                          onCancel={() => { peerPane.setCreatingFolder(false); }}
                        />
                      )}
                      {peerPane.creatingFile && (
                        <InlineCreateInput
                          label="New file:"
                          placeholder="filename.txt"
                          onCommit={peerPane.commitNewFile}
                          onCancel={() => { peerPane.setCreatingFile(false); }}
                        />
                      )}
                      {peerPane.error && (
                        <ErrorBanner error={peerPane.error} onDismiss={() => { peerPane.setError(null); }} />
                      )}
                      <SftpFileList
                        entries={peerPane.visibleEntries}
                        selected={peerPane.selected}
                        renaming={peerPane.renaming}
                        renameValue={peerPane.renameValue}
                        sortKey={sortKeyPeer}
                        sortDir={sortDirPeer}
                        onSort={handlePeerSort}
                        onSelect={handlePeerSelectWithPane}
                        onNavigate={peerPane.handleNavigateEntry}
                        hasClipboard={peerPane.clipboard !== null}
                        onRenameStart={peerPane.handleRenameStart}
                        onRenameChange={peerPane.setRenameValue}
                        onRenameCommit={peerPane.commitRename}
                        onRenameCancel={() => { peerPane.setRenaming(null); }}
                        onCut={peerPane.handleCut}
                        onCopy={peerPane.handleCopy}
                        onPaste={peerPane.handlePaste}
                        onDelete={peerPane.handleDelete}
                        onEdit={peerPane.handleOpenEdit}
                        onChmod={peerPane.handleChmod}
                      />
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Transfer strip */}
            <div className="w-10 shrink-0 flex flex-col items-center justify-center gap-3 bg-surface-2 border-r border-stroke-subtle">
              {leftPaneIsLocal ? (
                <>
                  <button
                    onClick={handleUploadFromLocal}
                    disabled={!canUploadFromLocal}
                    title="Upload selected local files to remote"
                    className="p-1.5 rounded text-muted hover:text-white hover:bg-surface-4 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 8h10M9 4l4 4-4 4" />
                    </svg>
                  </button>
                  <button
                    onClick={handleDownloadToLocal}
                    disabled={!canDownloadToLocal}
                    title="Download selected remote files to local"
                    className="p-1.5 rounded text-muted hover:text-white hover:bg-surface-4 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 8H3M7 4L3 8l4 4" />
                    </svg>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { void handleCopyPeerToRemote(); }}
                    disabled={!canCopyPeerToRemote}
                    title="Copy selected peer files here"
                    className="p-1.5 rounded text-muted hover:text-white hover:bg-surface-4 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 8h10M9 4l4 4-4 4" />
                    </svg>
                  </button>
                  <button
                    onClick={() => { void handleCopyRemoteToPeer(); }}
                    disabled={!canCopyRemoteToPeer}
                    title="Copy selected files to peer"
                    className="p-1.5 rounded text-muted hover:text-white hover:bg-surface-4 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 8H3M7 4L3 8l4 4" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {/* Remote pane */}
        <div
          className={`flex-1 min-w-0 flex flex-col transition-colors ${showLocalPane && remoteDragCount > 0 ? "ring-2 ring-inset ring-accent/60 bg-accent/5" : ""}`}
          onDragEnter={() => { if (showLocalPane) setRemoteDragCount((c) => c + 1); }}
          onDragLeave={() => { if (showLocalPane) setRemoteDragCount((c) => Math.max(0, c - 1)); }}
          onDragOver={(e) => { if (showLocalPane) e.preventDefault(); }}
          onDrop={(e) => {
            setRemoteDragCount(0);
            const data = e.dataTransfer.getData("application/x-local-paths");
            if (data && showLocalPane) {
              e.preventDefault();
              handleUploadPaths(JSON.parse(data) as string[]);
            }
          }}
        >

      {/* Per-pane remote path bar — only in split mode */}
      {showLocalPane && (
        <div className="flex items-center gap-3 px-3 py-2.5 border-b border-stroke-subtle bg-surface-1 shrink-0">
          <button
            onClick={handleUp}
            disabled={isBusy || session.currentPath === "/"}
            className="p-1.5 rounded text-muted hover:text-white hover:bg-surface-3 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Go up (remote)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 16 16" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12V4M4 8l4-4 4 4" />
            </svg>
          </button>
          <PathBar
            path={session.currentPath}
            busy={isBusy}
            onNavigateTo={(p) => { navigate(p); }}
          />
          <button
            onClick={handleRefresh}
            disabled={isBusy}
            className="p-1.5 rounded text-muted hover:text-white hover:bg-surface-3 transition-colors disabled:opacity-30"
            title="Refresh (remote)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          {clipboard && (
            <span className="text-sm text-accent-fg shrink-0">
              ● {clipboard.mode === "copy" ? "copied" : "cut"} — paste to move here
            </span>
          )}
          {editingFiles.length > 0 && (
            <span className="text-sm text-amber-400 shrink-0 flex items-center gap-1">
              <span className="animate-pulse">●</span>
              Watching {editingFiles.length} file{editingFiles.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {confirmingDelete && (
        <ConfirmDeleteModal
          title={`Delete ${selected.length} item${selected.length !== 1 ? "s" : ""}?`}
          description="These files will be permanently deleted. This cannot be undone."
          onConfirm={commitDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      {/* New folder input */}
      {creatingFolder && <InlineCreateInput label="New folder:" placeholder="folder-name" onCommit={commitNewFolder} onCancel={() => setCreatingFolder(false)} />}

      {/* New file input */}
      {creatingFile && <InlineCreateInput label="New file:" placeholder="filename.txt" onCommit={commitNewFile} onCancel={() => setCreatingFile(false)} />}

      {/* Error banner */}
      {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}

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

      {/* Primary chmod dialog */}
      <ChmodDialog
        target={chmodTarget}
        mode={chmodMode}
        disabled={isBusy}
        onModeChange={setChmodMode}
        onApply={commitChmod}
        onCancel={cancelChmod}
      />

      {/* Peer chmod dialog */}
      {validPeer && (
        <ChmodDialog
          target={peerPane.chmodTarget}
          mode={peerPane.chmodMode}
          disabled={peerPane.isBusy}
          onModeChange={peerPane.setChmodMode}
          onApply={peerPane.commitChmod}
          onCancel={peerPane.cancelChmod}
        />
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
