import { useEffect, useCallback, useState, useRef, useMemo, lazy, Suspense } from "react";
import { useUiStore, type ViewMode, type SortMode } from "../../store/uiStore";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { useVaultStore } from "../../store/vaultStore";
import { useTerminalStore } from "../../store/terminalStore";
import { useBroadcastStore } from "../../store/broadcastStore";
import { useTerminalToolsStore } from "../../store/terminalToolsStore";
import { useSftpStore } from "../../store/sftpStore";
import { useServerStore } from "../../store/serverStore";
import { useAppInit } from "../../hooks/useAppInit";
import { useWakeReconnect } from "../../hooks/useWakeReconnect";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useVaultHeartbeat } from "../../hooks/useVaultHeartbeat";
import { useMenuEvents } from "../../hooks/useMenuEvents";
import { useTrayEvents } from "../../hooks/useTrayEvents";
import { trayCommands } from "../../lib/tauriCommands";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import TabItem from "./TabItem";
import ServerList from "../servers/ServerList";
import ServerForm from "../servers/ServerForm";
import VaultLockScreen from "../vault/VaultLockScreen";
import BulkActionBar from "../servers/BulkActionBar";
import ClipboardClearBanner from "./ClipboardClearBanner";
import { useSnippetStore } from "../../store/snippetStore";
import { usePlaybookStore } from "../../store/playbookStore";
import type { SessionStatus } from "../../store/terminalStore";
import type { SftpStatus } from "../../store/sftpStore";

// Lazy-loaded: these views/modals aren't needed for the initial paint, so
// keeping them out of the main bundle cuts startup parse/exec time.
const SshConfigImport = lazy(() => import("../servers/SshConfigImport"));
const DiscoverHosts = lazy(() => import("../servers/DiscoverHosts"));
const SettingsPage = lazy(() => import("../settings/SettingsPage"));
const VaultSetupModal = lazy(() => import("../vault/VaultSetupModal"));
const TerminalPane = lazy(() => import("../terminal/TerminalPane"));
const BroadcastGrid = lazy(() => import("../terminal/BroadcastGrid"));
const LogView = lazy(() => import("../log/LogView"));
const OnboardingWizard = lazy(() => import("../onboarding/OnboardingWizard"));
const SftpBrowser = lazy(() => import("../sftp/SftpBrowser"));
const SnippetList = lazy(() => import("../snippets/SnippetList"));
const PlaybookList = lazy(() => import("../playbooks/PlaybookList"));
const TunnelPanel = lazy(() => import("../tunnels/TunnelPanel"));
const KeysView = lazy(() => import("../keys/KeysView"));

type PanelType = "terminal" | "sftp";

const TERMINAL_STATUS_COLORS: Record<SessionStatus, string> = {
  connecting: "bg-yellow-500",
  connected: "bg-green-500",
  disconnected: "bg-dim",
  error: "bg-red-500",
};

const SFTP_STATUS_COLORS: Record<SftpStatus, string> = {
  connecting: "bg-yellow-500",
  connected: "bg-green-500",
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
  useTrayEvents();

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
  const discoverHostsOpen = useUiStore((s) => s.discoverHostsOpen);
  const closeDiscoverHosts = useUiStore((s) => s.closeDiscoverHosts);
  const isSetup = useVaultStore((s) => s.isSetup);
  const isUnlocked = useVaultStore((s) => s.isUnlocked);
  const isChecking = useVaultStore((s) => s.isChecking);
  const isPasswordRequired = useVaultStore((s) => s.isPasswordRequired);

  const terminalSessions = useTerminalStore((s) => s.sessions);
  const terminalActiveId = useTerminalStore((s) => s.activeSessionId);
  const terminalSetActive = useTerminalStore((s) => s.setActive);
  const terminalClose = useTerminalStore((s) => s.closeSession);
  const terminalReorder = useTerminalStore((s) => s.reorderSessions);
  const terminalRename = useTerminalStore((s) => s.renameSession);

  const activeBroadcastGroupId = useBroadcastStore((s) => s.activeGroupId);

  const openTerminalTool = useTerminalToolsStore((s) => s.openTool);
  const toggleTerminalTool = useTerminalToolsStore((s) => s.toggleTool);
  const closeTerminalTool = useTerminalToolsStore((s) => s.closeTool);

  const allSftpSessions = useSftpStore((s) => s.sessions);
  const sftpSessions = useMemo(
    () => allSftpSessions.filter((s) => !s.hidden),
    [allSftpSessions],
  );
  const sftpActiveId = useSftpStore((s) => s.activeSessionId);
  const sftpSetActive = useSftpStore((s) => s.setActive);
  const sftpClose = useSftpStore((s) => s.closeSession);
  const sftpReorder = useSftpStore((s) => s.reorderSessions);
  const sftpOpenSession = useSftpStore((s) => s.openSession);

  const servers = useServerStore((s) => s.servers);
  const terminalOpenSession = useTerminalStore((s) => s.openSession);
  const fetchSnippets = useSnippetStore((s) => s.fetchAll);
  const fetchPlaybooks = usePlaybookStore((s) => s.fetchAll);

  const [activePanelType, setActivePanelType] = useState<PanelType>("terminal");

  const activeTerminalSession = terminalSessions.find((t) => t.id === terminalActiveId);
  const linkedSftpSession = activeTerminalSession
    ? sftpSessions.find((x) => x.serverId === activeTerminalSession.serverId)
    : undefined;
  const isSftpActive = activePanelType === "sftp" && linkedSftpSession?.id === sftpActiveId;
  const [showNewTabPicker, setShowNewTabPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerError, setPickerError] = useState<string | null>(null);
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
    if (activeView === "snippets") void fetchSnippets();
  }, [activeView, fetchSnippets]);

  useEffect(() => {
    if (activeView === "playbooks") void fetchPlaybooks();
  }, [activeView, fetchPlaybooks]);

  useEffect(() => {
    void trayCommands.updateMenu(
      servers.map((s) => ({ id: s.id, displayName: s.displayName, hostname: s.hostname })),
    );
  }, [servers]);

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
    closeTerminalTool();
  }, [terminalActiveId, sftpActiveId, activePanelType, closeTerminalTool]);

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

  if (!isSetup && isPasswordRequired) {
    return (
      <Suspense fallback={null}>
        <VaultSetupModal />
      </Suspense>
    );
  }
  if (isSetup && !isUnlocked && isPasswordRequired) return <VaultLockScreen />;

  return (
    <div className="flex flex-col h-screen bg-surface-base text-white overflow-hidden">
      <TopBar />

      <div className="flex flex-1 min-h-0">
      {!sidebarCollapsed && <Sidebar />}

      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex flex-1 min-h-0">
          {/* Server list / logs / tunnels */}
          <main
            className={`shrink-0 transition-[width,padding] duration-200 ${
              activeBroadcastGroupId
                ? "w-0 p-0 overflow-hidden"
                : activeView === "logs" || activeView === "snippets" || activeView === "playbooks" || activeView === "tunnels" || activeView === "settings" || activeView === "keys"
                  ? "flex-1 overflow-hidden flex flex-col"
                  : hasPanel
                    ? serverListCollapsed
                      ? "w-0 p-0 overflow-hidden"
                      : "w-72 border-r border-stroke-subtle overflow-hidden flex flex-col"
                    : "flex-1 overflow-hidden flex flex-col"
            }`}
          >
            {activeView === "settings" ? (
              <Suspense fallback={null}>
                <SettingsPage />
              </Suspense>
            ) : activeView === "keys" ? (
              <Suspense fallback={null}>
                <KeysView />
              </Suspense>
            ) : activeView === "snippets" ? (
              <Suspense fallback={null}>
                <SnippetList />
              </Suspense>
            ) : activeView === "playbooks" ? (
              <Suspense fallback={null}>
                <PlaybookList />
              </Suspense>
            ) : activeView === "tunnels" ? (
              <Suspense fallback={null}>
                <TunnelPanel />
              </Suspense>
            ) : activeView === "logs" ? (
              <>
                <div className="px-4 py-2 border-b border-stroke-subtle shrink-0">
                  <Input
                    value={logSearchQuery}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Search logs…"
                  />
                </div>
                <Suspense fallback={null}>
                  <LogView />
                </Suspense>
              </>
            ) : (
              <>
                {/* Server list toolbar */}
                <div className="px-3 h-14 border-b border-stroke-subtle shrink-0 flex items-center gap-2">
                  <div className="relative flex-1 min-w-0">
                    <Input
                      ref={searchRef}
                      data-search-input
                      value={searchQuery}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search…"
                      className="pr-10"
                    />
                    {!searchQuery && (
                      <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-dim pointer-events-none select-none">⌘K</kbd>
                    )}
                  </div>
                  {!(hasPanel && !serverListCollapsed) && (
                    <>
                      <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
                        <SelectTrigger className="h-10 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Default</SelectItem>
                          <SelectItem value="name_asc">A → Z</SelectItem>
                          <SelectItem value="name_desc">Z → A</SelectItem>
                          <SelectItem value="host">Host</SelectItem>
                          <SelectItem value="last_connected">Recent</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center h-10 bg-surface-3 border border-stroke rounded overflow-hidden shrink-0">
                        {(["card", "row"] as ViewMode[]).map((mode) => (
                          <Button
                            key={mode}
                            variant="ghost"
                            onClick={() => setViewMode(mode)}
                            aria-label={mode === "card" ? "Card view" : "List view"}
                            className={`px-1.5 h-full rounded-none ${viewMode === mode ? "bg-surface-4 text-white" : "text-faint hover:text-muted"}`}
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
                          </Button>
                        ))}
                      </div>
                      <Button
                        variant="ghost"
                        onClick={toggleBulkMode}
                        className={`h-10 px-2 rounded border shrink-0 ${bulkMode ? "bg-accent/10 border-accent/30 text-accent-fg" : "bg-surface-3 border-stroke text-faint hover:text-muted"}`}
                      >
                        {bulkMode ? `Cancel${bulkSelected.length > 0 ? ` (${bulkSelected.length})` : ""}` : "Select"}
                      </Button>
                    </>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  <ServerList />
                </div>
                {bulkMode && <BulkActionBar />}
              </>
            )}
          </main>

          {/* Collapse / expand handle */}
          {!activeBroadcastGroupId && hasPanel && activeView !== "logs" && activeView !== "snippets" && activeView !== "playbooks" && activeView !== "tunnels" && activeView !== "settings" && activeView !== "keys" && (
            <Button
              variant="ghost"
              onClick={toggleServerList}
              aria-label={serverListCollapsed ? "Expand server list" : "Collapse server list"}
              className="w-4 h-auto shrink-0 rounded-none justify-center bg-surface-0 border-r border-stroke-subtle hover:bg-surface-2 group"
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
            </Button>
          )}

          {/* Unified panel: terminals + SFTP browsers */}
          {hasPanel && activeView !== "logs" && activeView !== "snippets" && activeView !== "playbooks" && activeView !== "tunnels" && activeView !== "settings" && activeView !== "keys" && (
            <div className="flex flex-col flex-1 min-w-0">
              {/* Unified tab bar */}
              <div
                className="h-14 bg-surface-1 border-b border-stroke-subtle flex items-center shrink-0"
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) resetDrag();
                }}
                onDragEnd={resetDrag}
              >
                <div className="relative flex-1 min-w-0">
                  {tabFade.left && (
                    <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-surface-1 to-transparent flex items-center justify-start pl-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => tabBarRef.current?.scrollBy({ left: -120, behavior: "smooth" })}
                        className="pointer-events-auto text-muted hover:text-white leading-none"
                        aria-label="Scroll tabs left"
                      >‹</Button>
                    </div>
                  )}
                  {tabFade.right && (
                    <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-surface-1 to-transparent flex items-center justify-end pr-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => tabBarRef.current?.scrollBy({ left: 120, behavior: "smooth" })}
                        className="pointer-events-auto text-muted hover:text-white leading-none"
                        aria-label="Scroll tabs right"
                      >›</Button>
                    </div>
                  )}
                  <div ref={tabBarRef} className="flex items-center gap-1 px-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                  {terminalSessions.map((session) => (
                    <TabItem
                      key={session.id}
                      serverName={session.customName ?? session.serverName}
                      statusColor={TERMINAL_STATUS_COLORS[session.status]}
                      isActive={activePanelType === "terminal" && session.id === terminalActiveId}
                      isDragging={drag?.id === session.id}
                      isDragOver={dragOverId === session.id && drag?.id !== session.id}
                      title={
                        session.status === "error" && session.errorMessage
                          ? `${session.serverName} — ${session.errorMessage}`
                          : session.customName
                            ? `${session.customName} (${session.serverName})`
                            : session.serverName
                      }
                      closeLabel={`Close ${session.serverName}`}
                      onActivate={() => {
                        terminalSetActive(session.id);
                        setActivePanelType("terminal");
                      }}
                      onClose={() => void terminalClose(session.id)}
                      onRename={(name) => terminalRename(session.id, name)}
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
                <div className="px-1.5 shrink-0 relative">
                  <Button
                    ref={newTabButtonRef}
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      setShowNewTabPicker((v) => !v);
                      setPickerQuery("");
                      setPickerError(null);
                    }}
                    title="New terminal session"
                    aria-label="New terminal session"
                    className="text-faint hover:text-white"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3v10M3 8h10" />
                    </svg>
                  </Button>
                  {showNewTabPicker && (
                    <div
                      ref={newTabPickerRef}
                      className="absolute top-full right-0 mt-1 w-60 bg-surface-2/80 backdrop-blur-xl border border-stroke rounded-lg shadow-overlay z-50 overflow-hidden"
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
                              setPickerError(null);
                            }
                          }}
                          placeholder="Search servers…"
                          className="w-full bg-surface-3 border border-stroke rounded px-2.5 py-1.5 text-sm text-white placeholder-faint outline-none focus:border-accent transition-colors"
                        />
                      </div>
                      {pickerError && (
                        <p className="px-3 py-2 text-xs text-error border-b border-stroke-subtle bg-error-subtle">
                          {pickerError}
                        </p>
                      )}
                      <div className="max-h-60 overflow-y-auto">
                        {pickerServers.length > 0 ? (
                          pickerServers.map((server) => (
                            <button
                              key={server.id}
                              onClick={async () => {
                                const id = await terminalOpenSession(server.id, server.displayName);
                                if (id === null) {
                                  setPickerError("Maximum terminal sessions (20) reached");
                                } else {
                                  setShowNewTabPicker(false);
                                  setPickerQuery("");
                                  setPickerError(null);
                                }
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:bg-surface-3 hover:text-white transition-colors text-left"
                            >
                              <span className="flex-1 truncate">{server.displayName}</span>
                              <span className="text-meta text-dim truncate max-w-[90px]">{server.hostname}</span>
                            </button>
                          ))
                        ) : (
                          <p className="px-3 py-4 text-center text-sm text-dim">No servers</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* AI assistant, playbook, and snippet picker triggers for the active terminal session */}
                {activePanelType === "terminal" && terminalActiveId && (
                  <div className="px-1.5 shrink-0 border-l border-stroke-subtle flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      data-terminal-tool-trigger
                      onClick={() => toggleTerminalTool("assistant")}
                      title="AI assistant"
                      aria-label="Open AI assistant"
                      className={
                        openTerminalTool === "assistant"
                          ? "bg-accent/20 text-accent-fg"
                          : "text-faint hover:text-white"
                      }
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                        <path d="M20 3v4" />
                        <path d="M22 5h-4" />
                        <path d="M4 17v2" />
                        <path d="M5 18H3" />
                      </svg>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      data-terminal-tool-trigger
                      onClick={() => toggleTerminalTool("playbooks")}
                      title="Run a playbook"
                      aria-label="Open playbook picker"
                      className={
                        openTerminalTool === "playbooks"
                          ? "bg-accent/20 text-accent-fg"
                          : "text-faint hover:text-white"
                      }
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="6,4 12,8 6,12" />
                      </svg>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      data-terminal-tool-trigger
                      onClick={() => toggleTerminalTool("snippets")}
                      title="Run a snippet"
                      aria-label="Open snippet picker"
                      className={
                        openTerminalTool === "snippets"
                          ? "bg-accent/20 text-accent-fg"
                          : "text-faint hover:text-white"
                      }
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="2" width="12" height="12" rx="2" />
                        <line x1="5" y1="5.5" x2="11" y2="5.5" />
                        <line x1="5" y1="8" x2="11" y2="8" />
                        <line x1="5" y1="10.5" x2="8" y2="10.5" />
                      </svg>
                    </Button>
                  </div>
                )}

                {/* Open SFTP browser for the active terminal session */}
                {activePanelType === "terminal" && terminalActiveId && (
                  <div className="px-1.5 shrink-0 border-l border-stroke-subtle">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        if (!activeTerminalSession) return;
                        if (linkedSftpSession) {
                          sftpSetActive(linkedSftpSession.id);
                          setActivePanelType("sftp");
                        } else {
                          void sftpOpenSession(activeTerminalSession.serverId, activeTerminalSession.serverName);
                        }
                      }}
                      title="Open SFTP browser"
                      aria-label="Open SFTP browser for this session"
                      className={
                        isSftpActive
                          ? "bg-accent/20 text-accent-fg"
                          : "text-faint hover:text-white"
                      }
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 4.5a1 1 0 0 1 1-1h2.5l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
                      </svg>
                    </Button>
                  </div>
                )}
              </div>

              {/* Panel content */}
              <div className="flex-1 min-h-0">
                <Suspense fallback={null}>
                  {activeBroadcastGroupId ? (
                    <BroadcastGrid key={activeBroadcastGroupId} groupId={activeBroadcastGroupId} />
                  ) : activePanelType === "terminal" && terminalActiveId && (
                    <TerminalPane key={terminalActiveId} sessionId={terminalActiveId} />
                  )}
                  {activePanelType === "sftp" && sftpActiveId && (
                    <SftpBrowser key={sftpActiveId} sessionId={sftpActiveId} />
                  )}
                </Suspense>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>

<ClipboardClearBanner />
      {(activeView === "add" || activeView === "edit") && <ServerForm />}
      <Suspense fallback={null}>
        {onboardingChecked && !onboardingComplete && (
          <OnboardingWizard onComplete={() => setOnboardingComplete(true)} />
        )}
        {importSshConfigOpen && <SshConfigImport onClose={closeImportSshConfig} />}
        {discoverHostsOpen && <DiscoverHosts onClose={closeDiscoverHosts} />}
      </Suspense>
    </div>
  );
}
