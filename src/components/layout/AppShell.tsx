import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { useUiStore, type ViewMode, type SortMode } from "../../store/uiStore";
import { useVaultStore } from "../../store/vaultStore";
import { useTerminalStore } from "../../store/terminalStore";
import { useSftpStore } from "../../store/sftpStore";
import { useServerStore } from "../../store/serverStore";
import { useAppInit } from "../../hooks/useAppInit";
import { useWakeReconnect } from "../../hooks/useWakeReconnect";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useVaultHeartbeat } from "../../hooks/useVaultHeartbeat";
import { useMenuEvents } from "../../hooks/useMenuEvents";
import SshConfigImport from "../servers/SshConfigImport";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import TabItem from "./TabItem";
import ServerList from "../servers/ServerList";
import ServerForm from "../servers/ServerForm";
import VaultLockScreen from "../vault/VaultLockScreen";
import VaultSetupModal from "../vault/VaultSetupModal";
import TerminalPane from "../terminal/TerminalPane";
import LogView from "../log/LogView";
import OnboardingWizard from "../onboarding/OnboardingWizard";
import SftpBrowser from "../sftp/SftpBrowser";
import BulkActionBar from "../servers/BulkActionBar";
import ClipboardClearBanner from "./ClipboardClearBanner";
import type { SessionStatus } from "../../store/terminalStore";
import type { SftpStatus } from "../../store/sftpStore";

type PanelType = "terminal" | "sftp";

const TERMINAL_STATUS_COLORS: Record<SessionStatus, string> = {
  connecting: "bg-yellow-500",
  connected: "bg-accent",
  disconnected: "bg-[#444]",
  error: "bg-red-500",
};

const SFTP_STATUS_COLORS: Record<SftpStatus, string> = {
  connecting: "bg-yellow-500",
  connected: "bg-accent",
  error: "bg-red-500",
};

const SFTP_FOLDER_ICON = (
  <svg className="w-3 h-3 text-accent-fg shrink-0" fill="currentColor" viewBox="0 0 20 20">
    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
  </svg>
);

function reorderById<T extends { id: string }>(list: T[], fromId: string, toId: string): T[] {
  const from = list.findIndex((s) => s.id === fromId);
  const to = list.findIndex((s) => s.id === toId);
  if (from === -1 || to === -1) return list;
  const next = [...list];
  next.splice(from, 1);
  next.splice(to, 0, list[from]);
  return next;
}

export default function AppShell() {
  useAppInit();
  useWakeReconnect();
  useKeyboardShortcuts();
  useVaultHeartbeat();
  useMenuEvents();

  const activeView = useUiStore((s) => s.activeView);
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const bulkMode = useUiStore((s) => s.bulkMode);
  const toggleBulkMode = useUiStore((s) => s.toggleBulkMode);
  const bulkSelected = useUiStore((s) => s.bulkSelected);
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const sortMode = useUiStore((s) => s.sortMode);
  const setSortMode = useUiStore((s) => s.setSortMode);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const setSearch = useUiStore((s) => s.setSearch);
  const logSearchQuery = useUiStore((s) => s.logSearchQuery);
  const setLogSearch = useUiStore((s) => s.setLogSearch);
  const serverListCollapsed = useUiStore((s) => s.serverListCollapsed);
  const toggleServerList = useUiStore((s) => s.toggleServerList);
  const collapseServerList = useUiStore((s) => s.collapseServerList);
  const onboardingComplete = useUiStore((s) => s.onboardingComplete);
  const onboardingChecked = useUiStore((s) => s.onboardingChecked);
  const setOnboardingComplete = useUiStore((s) => s.setOnboardingComplete);
  const importSshConfigOpen = useUiStore((s) => s.importSshConfigOpen);
  const closeImportSshConfig = useUiStore((s) => s.closeImportSshConfig);
  const isSetup = useVaultStore((s) => s.isSetup);
  const isUnlocked = useVaultStore((s) => s.isUnlocked);
  const isChecking = useVaultStore((s) => s.isChecking);
  const isPasswordRequired = useVaultStore((s) => s.isPasswordRequired);

  const terminalSessions = useTerminalStore((s) => s.sessions);
  const terminalActiveId = useTerminalStore((s) => s.activeSessionId);
  const terminalSetActive = useTerminalStore((s) => s.setActive);
  const terminalClose = useTerminalStore((s) => s.closeSession);
  const terminalReorder = useTerminalStore((s) => s.reorderSessions);

  const sftpSessions = useSftpStore((s) => s.sessions);
  const sftpActiveId = useSftpStore((s) => s.activeSessionId);
  const sftpSetActive = useSftpStore((s) => s.setActive);
  const sftpClose = useSftpStore((s) => s.closeSession);
  const sftpReorder = useSftpStore((s) => s.reorderSessions);
  const sftpOpenSession = useSftpStore((s) => s.openSession);

  const servers = useServerStore((s) => s.servers);
  const terminalOpenSession = useTerminalStore((s) => s.openSession);

  const [activePanelType, setActivePanelType] = useState<PanelType>("terminal");
  const [showNewTabPicker, setShowNewTabPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const newTabButtonRef = useRef<HTMLButtonElement>(null);
  const newTabPickerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const [tabFade, setTabFade] = useState({ left: false, right: false });

  // Consolidated drag state — three separate atoms caused triple renders per drag-start.
  const [drag, setDrag] = useState<{ id: string; type: PanelType } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const resetDrag = useCallback(() => {
    setDrag(null);
    setDragOverId(null);
  }, []);

  const handleDragStart = useCallback((id: string, type: PanelType, e: React.DragEvent) => {
    setDrag({ id, type });
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback(
    (id: string, type: PanelType, e: React.DragEvent) => {
      if (drag?.type !== type) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverId(id);
    },
    [drag?.type],
  );

  const handleDrop = useCallback(
    (targetId: string, type: PanelType, e: React.DragEvent) => {
      e.preventDefault();
      if (!drag || drag.type !== type || drag.id === targetId) {
        resetDrag();
        return;
      }
      if (type === "terminal") {
        terminalReorder(reorderById(terminalSessions, drag.id, targetId));
      } else {
        sftpReorder(reorderById(sftpSessions, drag.id, targetId));
      }
      resetDrag();
    },
    [drag, terminalSessions, sftpSessions, terminalReorder, sftpReorder, resetDrag],
  );

  const hasTerminal = terminalSessions.length > 0;
  const hasSftp = sftpSessions.length > 0;
  const hasPanel = hasTerminal || hasSftp;

  const pickerServers = useMemo(
    () =>
      !pickerQuery
        ? servers
        : servers.filter(
            (s) =>
              s.displayName.toLowerCase().includes(pickerQuery.toLowerCase()) ||
              s.hostname.toLowerCase().includes(pickerQuery.toLowerCase()),
          ),
    [servers, pickerQuery],
  );

  // Bring a panel type to the foreground only when a NEW session is added
  // (length increases), not when one closes.
  const prevTerminalCount = useRef(terminalSessions.length);
  const prevSftpCount = useRef(sftpSessions.length);

  useEffect(() => {
    if (terminalSessions.length > prevTerminalCount.current) {
      setActivePanelType("terminal");
      collapseServerList();
    }
    prevTerminalCount.current = terminalSessions.length;
  }, [terminalSessions.length, collapseServerList]);

  useEffect(() => {
    if (sftpSessions.length > prevSftpCount.current) {
      setActivePanelType("sftp");
      collapseServerList();
    }
    prevSftpCount.current = sftpSessions.length;
  }, [sftpSessions.length, collapseServerList]);

  // Fall back when the active type's last session closes.
  useEffect(() => {
    if (activePanelType === "terminal" && !hasTerminal && hasSftp) {
      setActivePanelType("sftp");
    } else if (activePanelType === "sftp" && !hasSftp && hasTerminal) {
      setActivePanelType("terminal");
    }
  }, [activePanelType, hasTerminal, hasSftp]);

  useEffect(() => {
    if (!showNewTabPicker) return;
    const close = (e: MouseEvent) => {
      if (
        !newTabPickerRef.current?.contains(e.target as Node) &&
        !newTabButtonRef.current?.contains(e.target as Node)
      ) {
        setShowNewTabPicker(false);
        setPickerQuery("");
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showNewTabPicker]);

  const updateTabFade = useCallback(() => {
    const el = tabBarRef.current;
    if (!el) return;
    setTabFade({
      left: el.scrollLeft > 0,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    const el = tabBarRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateTabFade, { passive: true });
    updateTabFade();
    return () => el.removeEventListener("scroll", updateTabFade);
  }, [updateTabFade]);

  useEffect(() => {
    requestAnimationFrame(updateTabFade);
  }, [terminalSessions.length, sftpSessions.length, updateTabFade]);

  useEffect(() => {
    const el = tabBarRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.querySelector<HTMLElement>("[data-active='true']")?.scrollIntoView({ block: "nearest", inline: "nearest" });
      updateTabFade();
    });
  }, [terminalActiveId, sftpActiveId, activePanelType, updateTabFade]);

  if (isChecking) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-base text-muted text-sm">
        Loading…
      </div>
    );
  }

  if (!isSetup && isPasswordRequired) return <VaultSetupModal />;
  if (isSetup && !isUnlocked && isPasswordRequired) return <VaultLockScreen />;

  return (
    <div className="flex flex-col h-screen bg-surface-base text-white overflow-hidden">
      <TopBar />

      <div className="flex flex-1 min-h-0">
      {!sidebarCollapsed && <Sidebar />}

      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex flex-1 min-h-0">
          {/* Server list / logs */}
          <main
            className={`shrink-0 transition-[width,padding] duration-200 ${
              activeView === "logs"
                ? "flex-1 overflow-hidden flex flex-col"
                : hasPanel
                  ? serverListCollapsed
                    ? "w-0 p-0 overflow-hidden"
                    : "w-72 border-r border-stroke-subtle overflow-hidden flex flex-col"
                  : "flex-1 overflow-hidden flex flex-col"
            }`}
          >
            {activeView === "logs" ? (
              <>
                <div className="px-4 py-2 border-b border-stroke-subtle shrink-0">
                  <input
                    value={logSearchQuery}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Search logs…"
                    className="w-full h-8 bg-surface-3 border border-stroke rounded px-3 text-sm text-white placeholder-faint focus:outline-none focus:border-accent transition-colors"
                  />
                </div>
                <LogView />
              </>
            ) : (
              <>
                {/* Server list toolbar */}
                <div className="px-3 h-10 border-b border-stroke-subtle shrink-0 flex items-center gap-2">
                  <div className="relative flex-1 min-w-0">
                    <input
                      ref={searchRef}
                      data-search-input
                      value={searchQuery}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search…"
                      className="w-full h-7 bg-surface-3 border border-stroke rounded px-3 pr-10 text-xs text-white placeholder-faint focus:outline-none focus:border-accent transition-colors"
                    />
                    {!searchQuery && (
                      <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-dim pointer-events-none select-none">⌘K</kbd>
                    )}
                  </div>
                  {!(hasPanel && !serverListCollapsed) && (
                    <>
                      <select
                        value={sortMode}
                        onChange={(e) => setSortMode(e.target.value as SortMode)}
                        className="h-7 bg-surface-3 border border-stroke rounded px-2 text-xs text-secondary focus:outline-none focus:border-accent shrink-0 cursor-pointer"
                      >
                        <option value="default">Default</option>
                        <option value="name_asc">A → Z</option>
                        <option value="name_desc">Z → A</option>
                        <option value="host">Host</option>
                        <option value="last_connected">Recent</option>
                      </select>
                      <div className="flex items-center bg-surface-3 border border-stroke rounded overflow-hidden shrink-0">
                        {(["card", "row"] as ViewMode[]).map((mode) => (
                          <button
                            key={mode}
                            onClick={() => setViewMode(mode)}
                            aria-label={mode === "card" ? "Card view" : "List view"}
                            className={`p-1 transition-colors ${viewMode === mode ? "bg-surface-4 text-white" : "text-faint hover:text-muted"}`}
                          >
                            {mode === "card" ? (
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                                <rect x="1" y="1" width="6" height="6" rx="1" />
                                <rect x="9" y="1" width="6" height="6" rx="1" />
                                <rect x="1" y="9" width="6" height="6" rx="1" />
                                <rect x="9" y="9" width="6" height="6" rx="1" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
                                <line x1="1" y1="4" x2="15" y2="4" />
                                <line x1="1" y1="8" x2="15" y2="8" />
                                <line x1="1" y1="12" x2="15" y2="12" />
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={toggleBulkMode}
                        className={`h-7 px-2 rounded border text-xs transition-colors shrink-0 ${bulkMode ? "bg-accent/10 border-accent/30 text-accent-fg" : "bg-surface-3 border-stroke text-faint hover:text-muted"}`}
                      >
                        {bulkMode ? `Cancel${bulkSelected.length > 0 ? ` (${bulkSelected.length})` : ""}` : "Select"}
                      </button>
                    </>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <ServerList />
                </div>
                {bulkMode && <BulkActionBar />}
              </>
            )}
          </main>

          {/* Collapse / expand handle */}
          {hasPanel && activeView !== "logs" && (
            <button
              onClick={toggleServerList}
              aria-label={serverListCollapsed ? "Expand server list" : "Collapse server list"}
              className="w-4 shrink-0 flex items-center justify-center bg-surface-0 border-r border-stroke-subtle hover:bg-surface-2 transition-colors group"
            >
              <svg
                className="w-2.5 h-2.5 text-dim group-hover:text-muted transition-colors"
                fill="none"
                viewBox="0 0 6 10"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {serverListCollapsed ? (
                  <polyline points="1,1 5,5 1,9" />
                ) : (
                  <polyline points="5,1 1,5 5,9" />
                )}
              </svg>
            </button>
          )}

          {/* Unified panel: terminals + SFTP browsers */}
          {hasPanel && activeView !== "logs" && (
            <div className="flex flex-col flex-1 min-w-0">
              {/* Unified tab bar */}
              <div
                className="h-10 bg-surface-1 border-b border-stroke-subtle flex items-center shrink-0"
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) resetDrag();
                }}
                onDragEnd={resetDrag}
              >
                <div className="relative flex-1 min-w-0">
                  {tabFade.left && (
                    <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-surface-1 to-transparent flex items-center justify-start pl-0.5">
                      <button
                        onClick={() => tabBarRef.current?.scrollBy({ left: -120, behavior: "smooth" })}
                        className="pointer-events-auto text-muted hover:text-white transition-colors leading-none"
                        aria-label="Scroll tabs left"
                      >‹</button>
                    </div>
                  )}
                  {tabFade.right && (
                    <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-surface-1 to-transparent flex items-center justify-end pr-0.5">
                      <button
                        onClick={() => tabBarRef.current?.scrollBy({ left: 120, behavior: "smooth" })}
                        className="pointer-events-auto text-muted hover:text-white transition-colors leading-none"
                        aria-label="Scroll tabs right"
                      >›</button>
                    </div>
                  )}
                  <div ref={tabBarRef} className="flex items-center gap-1 px-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                  {terminalSessions.map((session) => (
                    <TabItem
                      key={session.id}
                      serverName={session.serverName}
                      statusColor={TERMINAL_STATUS_COLORS[session.status]}
                      isActive={activePanelType === "terminal" && session.id === terminalActiveId}
                      isDragging={drag?.id === session.id}
                      isDragOver={dragOverId === session.id && drag?.id !== session.id}
                      title={
                        session.status === "error" && session.errorMessage
                          ? `${session.serverName} — ${session.errorMessage}`
                          : session.serverName
                      }
                      closeLabel={`Close ${session.serverName}`}
                      onActivate={() => {
                        terminalSetActive(session.id);
                        setActivePanelType("terminal");
                      }}
                      onClose={() => void terminalClose(session.id)}
                      onDragStart={(e) => handleDragStart(session.id, "terminal", e)}
                      onDragOver={(e) => handleDragOver(session.id, "terminal", e)}
                      onDrop={(e) => handleDrop(session.id, "terminal", e)}
                    />
                  ))}

                  {/* Separator between terminal and SFTP tab groups */}
                  {hasTerminal && hasSftp && (
                    <div className="w-px h-5 bg-stroke mx-1 shrink-0" />
                  )}

                  {sftpSessions.map((session) => (
                    <TabItem
                      key={session.id}
                      serverName={session.serverName}
                      statusColor={SFTP_STATUS_COLORS[session.status]}
                      isActive={activePanelType === "sftp" && session.id === sftpActiveId}
                      isDragging={drag?.id === session.id}
                      isDragOver={dragOverId === session.id && drag?.id !== session.id}
                      title={session.serverName}
                      icon={SFTP_FOLDER_ICON}
                      closeLabel={`Close ${session.serverName} browser`}
                      onActivate={() => {
                        sftpSetActive(session.id);
                        setActivePanelType("sftp");
                      }}
                      onClose={() => void sftpClose(session.id)}
                      onDragStart={(e) => handleDragStart(session.id, "sftp", e)}
                      onDragOver={(e) => handleDragOver(session.id, "sftp", e)}
                      onDrop={(e) => handleDrop(session.id, "sftp", e)}
                    />
                  ))}
                  </div>
                </div>

                {/* New terminal session */}
                <div className="px-1.5 shrink-0 relative border-l border-stroke-subtle">
                  <button
                    ref={newTabButtonRef}
                    onClick={() => {
                      setShowNewTabPicker((v) => !v);
                      setPickerQuery("");
                    }}
                    title="New terminal session"
                    aria-label="New terminal session"
                    className="w-7 h-7 flex items-center justify-center rounded text-faint hover:text-white hover:bg-surface-3 transition-colors text-lg leading-none"
                  >
                    +
                  </button>
                  {showNewTabPicker && (
                    <div
                      ref={newTabPickerRef}
                      className="absolute top-full right-0 mt-1 w-60 bg-surface-2 border border-stroke rounded-lg shadow-2xl z-50 overflow-hidden"
                    >
                      <div className="p-2 border-b border-stroke-subtle">
                        <input
                          autoFocus
                          type="text"
                          value={pickerQuery}
                          onChange={(e) => setPickerQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              setShowNewTabPicker(false);
                              setPickerQuery("");
                            }
                          }}
                          placeholder="Search servers…"
                          className="w-full bg-surface-3 border border-stroke rounded px-2.5 py-1.5 text-sm text-white placeholder-faint outline-none focus:border-accent transition-colors"
                        />
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {pickerServers.length > 0 ? (
                          pickerServers.map((server) => (
                            <button
                              key={server.id}
                              onClick={() => {
                                void terminalOpenSession(server.id, server.displayName);
                                setShowNewTabPicker(false);
                                setPickerQuery("");
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:bg-surface-3 hover:text-white transition-colors text-left"
                            >
                              <span className="flex-1 truncate">{server.displayName}</span>
                              <span className="text-xs text-dim truncate max-w-[90px]">{server.hostname}</span>
                            </button>
                          ))
                        ) : (
                          <p className="px-3 py-4 text-center text-sm text-dim">No servers</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Open SFTP browser for the active terminal session */}
                {activePanelType === "terminal" && terminalActiveId && (
                  <div className="px-1.5 shrink-0 border-l border-stroke-subtle">
                    <button
                      onClick={() => {
                        const s = terminalSessions.find((t) => t.id === terminalActiveId);
                        if (!s) return;
                        const existing = sftpSessions.find((x) => x.serverId === s.serverId);
                        if (existing) {
                          sftpSetActive(existing.id);
                          setActivePanelType("sftp");
                        } else {
                          void sftpOpenSession(s.serverId, s.serverName);
                        }
                      }}
                      title="Open SFTP browser"
                      aria-label="Open SFTP browser for this session"
                      className="w-7 h-7 flex items-center justify-center rounded text-faint hover:text-accent hover:bg-surface-3 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {/* Panel content */}
              <div className="flex-1 min-h-0">
                {activePanelType === "terminal" && terminalActiveId && (
                  <TerminalPane key={terminalActiveId} sessionId={terminalActiveId} />
                )}
                {activePanelType === "sftp" && sftpActiveId && (
                  <SftpBrowser key={sftpActiveId} sessionId={sftpActiveId} />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      </div>

<ClipboardClearBanner />
      {(activeView === "add" || activeView === "edit") && <ServerForm />}
      {onboardingChecked && !onboardingComplete && (
        <OnboardingWizard onComplete={() => setOnboardingComplete(true)} />
      )}
      {importSshConfigOpen && <SshConfigImport onClose={closeImportSshConfig} />}
    </div>
  );
}
