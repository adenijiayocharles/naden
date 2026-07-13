import { useEffect, useState, useRef, useMemo, lazy, Suspense } from "react";
import { ErrorBoundary } from "../shared/ErrorBoundary";
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
import { useTerminalStore } from "../../store/terminalStore";
import { useBroadcastStore } from "../../store/broadcastStore";
import { useTerminalToolsStore } from "../../store/terminalToolsStore";
import { useSftpStore } from "../../store/sftpStore";
import { useServerStore } from "../../store/serverStore";
import { useAppInit } from "../../hooks/useAppInit";
import { useWakeReconnect } from "../../hooks/useWakeReconnect";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useVaultHeartbeat } from "../../hooks/useVaultHeartbeat";
import { useVaultLocked } from "../../store/vaultStore";
import { useMenuEvents } from "../../hooks/useMenuEvents";
import { useTrayEvents } from "../../hooks/useTrayEvents";
import { useTabDragReorder } from "../../hooks/useTabDragReorder";
import { useTabScrollFade } from "../../hooks/useTabScrollFade";
import { trayCommands } from "../../lib/commands/tray";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import VaultGate from "./VaultGate";
import SessionTabStrip from "./SessionTabStrip";
import NewSessionPicker from "./NewSessionPicker";
import TerminalToolTriggers from "./TerminalToolTriggers";
import ServerList from "../servers/ServerList";
import ServerForm from "../servers/ServerForm";
import BulkActionBar from "../servers/BulkActionBar";
import ClipboardClearBanner from "./ClipboardClearBanner";
import SshConfigChangedBanner from "./SshConfigChangedBanner";
import { useSnippetStore } from "../../store/snippetStore";
import { usePlaybookStore } from "../../store/playbookStore";

// Lazy-loaded: these views/modals aren't needed for the initial paint, so
// keeping them out of the main bundle cuts startup parse/exec time.
const SshConfigImport = lazy(() => import("../servers/SshConfigImport"));
const DiscoverHosts = lazy(() => import("../servers/DiscoverHosts"));
const SettingsPage = lazy(() => import("../settings/SettingsPage"));
const TerminalPane = lazy(() => import("../terminal/TerminalPane"));
const BroadcastGrid = lazy(() => import("../terminal/BroadcastGrid"));
const LogView = lazy(() => import("../log/LogView"));
const OnboardingWizard = lazy(() => import("../onboarding/OnboardingWizard"));
const SftpBrowser = lazy(() => import("../sftp/SftpBrowser"));
const SnippetList = lazy(() => import("../snippets/SnippetList"));
const PlaybookList = lazy(() => import("../playbooks/PlaybookList"));
const TunnelPanel = lazy(() => import("../tunnels/TunnelPanel"));
const KeysView = lazy(() => import("../keys/KeysView"));
const CommandPalette = lazy(() => import("./CommandPalette"));

type PanelType = "terminal" | "sftp";

export default function AppShell() {
  useAppInit();
  useWakeReconnect();
  const [showNewTabPicker, setShowNewTabPicker] = useState(false);
  useKeyboardShortcuts({ onNewTab: () => setShowNewTabPicker(true) });
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
  const paletteOpen = useUiStore((s) => s.paletteOpen);
  const closePalette = useUiStore((s) => s.closePalette);
  const importSshConfigOpen = useUiStore((s) => s.importSshConfigOpen);
  const closeImportSshConfig = useUiStore((s) => s.closeImportSshConfig);
  const discoverHostsOpen = useUiStore((s) => s.discoverHostsOpen);
  const closeDiscoverHosts = useUiStore((s) => s.closeDiscoverHosts);
  const terminalSessions = useTerminalStore((s) => s.sessions);
  const terminalActiveId = useTerminalStore((s) => s.activeSessionId);
  const terminalSetActive = useTerminalStore((s) => s.setActive);
  const terminalClose = useTerminalStore((s) => s.closeSession);
  const terminalReorder = useTerminalStore((s) => s.reorderSessions);
  const terminalRename = useTerminalStore((s) => s.renameSession);

  const activeBroadcastGroupId = useBroadcastStore((s) => s.activeGroupId);
  const broadcastGroups = useBroadcastStore((s) => s.groups);
  const disbandBroadcastGroup = useBroadcastStore((s) => s.disbandGroup);
  const setActiveBroadcastGroup = useBroadcastStore((s) => s.setActiveGroup);

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
  const vaultLocked = useVaultLocked();

  const activeTerminalSession = terminalSessions.find((t) => t.id === terminalActiveId);
  const linkedSftpSession = activeTerminalSession
    ? sftpSessions.find((x) => x.serverId === activeTerminalSession.serverId)
    : undefined;
  const isSftpActive = activePanelType === "sftp" && linkedSftpSession?.id === sftpActiveId;
  const searchRef = useRef<HTMLInputElement>(null);

  const { drag, dragOverId, resetDrag, handleDragStart, handleDragOver, handleDrop } =
    useTabDragReorder(terminalSessions, sftpSessions, terminalReorder, sftpReorder);

  const hasTerminal = terminalSessions.length > 0;
  const hasSftp = sftpSessions.length > 0;
  const hasPanel = hasTerminal || hasSftp;

  const { tabBarRef, tabFade } = useTabScrollFade(
    terminalSessions.length,
    sftpSessions.length,
    terminalActiveId,
    sftpActiveId,
    activePanelType,
  );

  const visibleTerminalSessions = useMemo(
    () => terminalSessions.filter((s) => !s.broadcastGroupId),
    [terminalSessions],
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
      servers.map((s) => ({
        id: s.id,
        displayName: s.displayName,
        hostname: s.hostname,
        groupName: s.groupName,
      })),
    );
  }, [servers]);

  useEffect(() => {
    closeTerminalTool();
  }, [terminalActiveId, sftpActiveId, activePanelType, closeTerminalTool]);

  const openNewTerminalSession = async (serverId: string, serverName: string) => {
    const id = await terminalOpenSession(serverId, serverName);
    if (id !== null) setActiveBroadcastGroup(null);
    return id;
  };

  return (
    <VaultGate>
    <div className="flex flex-col h-screen bg-surface-base text-white overflow-hidden">
      <TopBar />

      <div className="flex flex-1 min-h-0">
      {!sidebarCollapsed && <Sidebar />}

      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex flex-1 min-h-0">
          {/* Server list / logs / tunnels */}
          <main
            className={`shrink-0 transition-[width,padding] duration-200 ${
              activeView === "logs" || activeView === "snippets" || activeView === "playbooks" || activeView === "tunnels" || activeView === "settings" || activeView === "keys"
                ? "flex-1 overflow-hidden flex flex-col"
                : hasPanel
                  ? serverListCollapsed
                    ? "w-0 p-0 overflow-hidden"
                    : "w-72 border-r border-stroke-subtle overflow-hidden flex flex-col"
                  : "flex-1 overflow-hidden flex flex-col"
            }`}
          >
            {activeView === "settings" ? (
              <ErrorBoundary inline>
                <Suspense fallback={null}>
                  <SettingsPage />
                </Suspense>
              </ErrorBoundary>
            ) : activeView === "keys" ? (
              <ErrorBoundary inline>
                <Suspense fallback={null}>
                  <KeysView />
                </Suspense>
              </ErrorBoundary>
            ) : activeView === "snippets" ? (
              <ErrorBoundary inline>
                <Suspense fallback={null}>
                  <SnippetList />
                </Suspense>
              </ErrorBoundary>
            ) : activeView === "playbooks" ? (
              <ErrorBoundary inline>
                <Suspense fallback={null}>
                  <PlaybookList />
                </Suspense>
              </ErrorBoundary>
            ) : activeView === "tunnels" ? (
              <ErrorBoundary inline>
                <Suspense fallback={null}>
                  <TunnelPanel />
                </Suspense>
              </ErrorBoundary>
            ) : activeView === "logs" ? (
              <>
                <div className="px-4 py-2 border-b border-stroke-subtle shrink-0">
                  <Input
                    value={logSearchQuery}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Search logs…"
                  />
                </div>
                <ErrorBoundary inline>
                  <Suspense fallback={null}>
                    <LogView />
                  </Suspense>
                </ErrorBoundary>
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
                    />
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
                <div className="flex-1 min-h-0 p-4 flex flex-col">
                  <ServerList />
                </div>
                {bulkMode && <BulkActionBar />}
              </>
            )}
          </main>

          {/* Collapse / expand handle */}
          {hasPanel && activeView !== "logs" && activeView !== "snippets" && activeView !== "playbooks" && activeView !== "tunnels" && activeView !== "settings" && activeView !== "keys" && (
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
                <SessionTabStrip
                  tabBarRef={tabBarRef}
                  tabFade={tabFade}
                  visibleTerminalSessions={visibleTerminalSessions}
                  activeBroadcastGroupId={activeBroadcastGroupId}
                  activePanelType={activePanelType}
                  terminalActiveId={terminalActiveId}
                  terminalSetActive={terminalSetActive}
                  terminalClose={terminalClose}
                  terminalRename={terminalRename}
                  broadcastGroups={broadcastGroups}
                  disbandBroadcastGroup={disbandBroadcastGroup}
                  setActiveBroadcastGroup={setActiveBroadcastGroup}
                  hasSftp={hasSftp}
                  sftpSessions={sftpSessions}
                  sftpActiveId={sftpActiveId}
                  sftpSetActive={sftpSetActive}
                  sftpClose={sftpClose}
                  onActivatePanel={setActivePanelType}
                  drag={drag}
                  dragOverId={dragOverId}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                />

                <NewSessionPicker
                  open={showNewTabPicker}
                  onOpenChange={setShowNewTabPicker}
                  servers={servers}
                  onOpenSession={openNewTerminalSession}
                />

                {!activeBroadcastGroupId && activePanelType === "terminal" && terminalActiveId && (
                  <TerminalToolTriggers
                    activeTerminalSession={activeTerminalSession}
                    openTerminalTool={openTerminalTool}
                    toggleTerminalTool={toggleTerminalTool}
                    linkedSftpSession={linkedSftpSession}
                    isSftpActive={isSftpActive}
                    onActivateSftp={(sessionId) => { sftpSetActive(sessionId); setActivePanelType("sftp"); }}
                    onOpenSftpForSession={(serverId, serverName) => { void sftpOpenSession(serverId, serverName); }}
                  />
                )}
              </div>

              {/* Panel content */}
              <div className="flex-1 min-h-0">
                <ErrorBoundary inline>
                  <Suspense fallback={null}>
                    {activeBroadcastGroupId ? (
                      <BroadcastGrid key={activeBroadcastGroupId} groupId={activeBroadcastGroupId} />
                    ) : activePanelType === "terminal" && terminalActiveId && (
                      <TerminalPane key={terminalActiveId} sessionId={terminalActiveId} />
                    )}
                    {sftpSessions.map((s) => {
                      // Gated on !vaultLocked too: a tab that was active when the vault
                      // auto-locked must stop reacting to keystrokes (e.g. refresh/navigate
                      // shortcuts) until the user unlocks again, even though it stays mounted.
                      const isTabActive = !vaultLocked && activePanelType === "sftp" && s.id === sftpActiveId;
                      return (
                        <div key={s.id} className={isTabActive ? "h-full" : "hidden"}>
                          <SftpBrowser sessionId={s.id} isActive={isTabActive} />
                        </div>
                      );
                    })}
                  </Suspense>
                </ErrorBoundary>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>

<ClipboardClearBanner />
<SshConfigChangedBanner />
      {(activeView === "add" || activeView === "edit") && <ServerForm />}
      <ErrorBoundary inline>
        <Suspense fallback={null}>
          {onboardingChecked && !onboardingComplete && (
            <OnboardingWizard onComplete={() => setOnboardingComplete(true)} />
          )}
          {importSshConfigOpen && <SshConfigImport onClose={closeImportSshConfig} />}
          {discoverHostsOpen && <DiscoverHosts onClose={closeDiscoverHosts} />}
          {paletteOpen && (
            <CommandPalette
              onActivateSession={(sessionId) => {
                closePalette();
                terminalSetActive(sessionId);
                setActiveBroadcastGroup(null);
                setActivePanelType("terminal");
              }}
            />
          )}
        </Suspense>
      </ErrorBoundary>
    </div>
    </VaultGate>
  );
}
