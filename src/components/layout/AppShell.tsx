import { useEffect, useCallback, useState, useRef } from "react";
import { useUiStore } from "../../store/uiStore";
import { useVaultStore } from "../../store/vaultStore";
import { useTerminalStore } from "../../store/terminalStore";
import { useSftpStore } from "../../store/sftpStore";
import { useAppInit } from "../../hooks/useAppInit";
import { useWakeReconnect } from "../../hooks/useWakeReconnect";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useVaultHeartbeat } from "../../hooks/useVaultHeartbeat";
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

  const activeView = useUiStore((s) => s.activeView);
  const bulkMode = useUiStore((s) => s.bulkMode);
  const serverListCollapsed = useUiStore((s) => s.serverListCollapsed);
  const toggleServerList = useUiStore((s) => s.toggleServerList);
  const collapseServerList = useUiStore((s) => s.collapseServerList);
  const onboardingComplete = useUiStore((s) => s.onboardingComplete);
  const onboardingChecked = useUiStore((s) => s.onboardingChecked);
  const setOnboardingComplete = useUiStore((s) => s.setOnboardingComplete);
  const { isSetup, isUnlocked, isChecking, isPasswordRequired } = useVaultStore();

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

  const [activePanelType, setActivePanelType] = useState<PanelType>("terminal");

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
    <div className="flex h-screen bg-surface-base text-white overflow-hidden">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0">
        <TopBar />
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
              <LogView />
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-5">
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
                className="h-10 bg-surface-1 border-b border-stroke-subtle flex items-center gap-1 px-2 overflow-x-auto shrink-0"
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) resetDrag();
                }}
                onDragEnd={resetDrag}
              >
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

      <ClipboardClearBanner />
      {(activeView === "add" || activeView === "edit") && <ServerForm />}
      {onboardingChecked && !onboardingComplete && (
        <OnboardingWizard onComplete={() => setOnboardingComplete(true)} />
      )}
    </div>
  );
}
