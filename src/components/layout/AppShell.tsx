import { useEffect, useCallback, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useServerStore } from "../../store/serverStore";
import { useUiStore } from "../../store/uiStore";
import { useVaultStore } from "../../store/vaultStore";
import { useTerminalStore } from "../../store/terminalStore";
import { useSftpStore } from "../../store/sftpStore";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import ServerList from "../servers/ServerList";
import ServerForm from "../servers/ServerForm";
import VaultLockScreen from "../vault/VaultLockScreen";
import VaultSetupModal from "../vault/VaultSetupModal";
import TerminalPane from "../terminal/TerminalPane";
import AuditLogView from "../audit/AuditLogView";
import OnboardingWizard from "../onboarding/OnboardingWizard";
import SftpBrowser from "../sftp/SftpBrowser";
import BulkActionBar from "../servers/BulkActionBar";
import ClipboardClearBanner from "./ClipboardClearBanner";
import { settingsCommands } from "../../lib/tauriCommands";
import { recordHeartbeat } from "../../lib/vaultActivity";
import { useTerminalSettings } from "../../lib/terminalSettings";
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

export default function AppShell() {
  const fetchAll = useServerStore((s) => s.fetchAll);
  const bulkMode = useUiStore((s) => s.bulkMode);
  const activeView = useUiStore((s) => s.activeView);
  const serverListCollapsed = useUiStore((s) => s.serverListCollapsed);
  const toggleServerList = useUiStore((s) => s.toggleServerList);
  const openAdd = useUiStore((s) => s.openAdd);
  const openSettings = useUiStore((s) => s.openSettings);
  const onboardingComplete = useUiStore((s) => s.onboardingComplete);
  const onboardingChecked = useUiStore((s) => s.onboardingChecked);
  const setOnboardingComplete = useUiStore((s) => s.setOnboardingComplete);
  const setOnboardingChecked = useUiStore((s) => s.setOnboardingChecked);
  const { isSetup, isUnlocked, isChecking, isPasswordRequired, check } = useVaultStore();
  const loadTerminalSettings = useTerminalSettings((s) => s.load);

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

  // Which panel type is currently in the foreground
  const [activePanelType, setActivePanelType] = useState<PanelType>("terminal");

  // Drag-and-drop tab reordering
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragType, setDragType] = useState<PanelType | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const resetDrag = () => { setDragId(null); setDragType(null); setDragOverId(null); };

  const handleDragStart = (id: string, type: PanelType) => (e: React.DragEvent) => {
    setDragId(id); setDragType(type);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (id: string, type: PanelType) => (e: React.DragEvent) => {
    if (type !== dragType) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(id);
  };

  const handleDrop = (targetId: string, type: PanelType) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragId || dragType !== type || dragId === targetId) { resetDrag(); return; }
    const move = <T extends { id: string }>(list: T[]): T[] => {
      const from = list.findIndex((s) => s.id === dragId);
      const to = list.findIndex((s) => s.id === targetId);
      if (from === -1 || to === -1) return list;
      const next = [...list];
      next.splice(from, 1);
      next.splice(to, 0, list[from]);
      return next;
    };
    if (type === "terminal") terminalReorder(move(terminalSessions));
    else sftpReorder(move(sftpSessions));
    resetDrag();
  };

  const hasTerminal = terminalSessions.length > 0;
  const hasSftp = sftpSessions.length > 0;
  const hasPanel = hasTerminal || hasSftp;

  // Bring a panel type to the foreground only when a NEW session is added
  // (length increases), not when one closes. Refs track the previous count.
  const prevTerminalCount = useRef(terminalSessions.length);
  const prevSftpCount = useRef(sftpSessions.length);

  useEffect(() => {
    if (terminalSessions.length > prevTerminalCount.current) setActivePanelType("terminal");
    prevTerminalCount.current = terminalSessions.length;
  }, [terminalSessions.length]);

  useEffect(() => {
    if (sftpSessions.length > prevSftpCount.current) setActivePanelType("sftp");
    prevSftpCount.current = sftpSessions.length;
  }, [sftpSessions.length]);

  // Fall back when the active type's last session closes
  useEffect(() => {
    if (activePanelType === "terminal" && !hasTerminal && hasSftp) setActivePanelType("sftp");
    if (activePanelType === "sftp" && !hasSftp && hasTerminal) setActivePanelType("terminal");
  }, [hasTerminal, hasSftp]); // intentionally omits activePanelType — only relevant when availability changes


  useEffect(() => {
    void fetchAll();
    void check();
    void loadTerminalSettings();
    // Apply persisted theme and accent colour before anything renders
    settingsCommands.getSetting("theme")
      .then((t) => { if (t && t !== "dark") document.documentElement.dataset.theme = t; })
      .catch(() => {});
    const ACCENTS: Record<string, [string, string, string]> = {
      lime:   ["#CDFF00", "#d8ff33", "#a8cc00"],
      green:  ["#00e676", "#33eb91", "#00b85e"],
      cyan:   ["#00d4ff", "#33ddff", "#00a8cc"],
      blue:   ["#4f8ef7", "#7aaeff", "#3a6bc4"],
      purple: ["#a78bfa", "#c4b0ff", "#7c5ccc"],
      orange: ["#ff8c42", "#ffa566", "#cc6f35"],
      pink:   ["#f472b6", "#f9a8d4", "#c4588c"],
      red:    ["#ff5555", "#ff7777", "#cc4444"],
      white:  ["#ffffff", "#eeeeee", "#cccccc"],
    };
    settingsCommands.getSetting("accent").then((id) => {
      if (id && id !== "lime" && ACCENTS[id]) {
        const [base, hover, dim] = ACCENTS[id];
        const root = document.documentElement;
        root.style.setProperty("--color-accent", base);
        root.style.setProperty("--color-accent-hover", hover);
        root.style.setProperty("--color-accent-dim", dim);
      }
    }).catch(() => {});
    // Check onboarding once on mount
    settingsCommands.getSetting("onboarding_complete")
      .then((v) => {
        setOnboardingComplete(v === "true");
        setOnboardingChecked();
      })
      .catch(() => { setOnboardingChecked(); });
  }, [fetchAll, check, loadTerminalSettings, setOnboardingComplete, setOnboardingChecked]);

  // Reconnect all sessions that died while the machine was asleep.
  useEffect(() => {
    const unlisten = listen("system:wake", () => {
      const { sessions: tSessions, reconnectSession: tReconnect } = useTerminalStore.getState();
      for (const s of tSessions) {
        if (s.status === "error") void tReconnect(s.id);
      }
      const { sessions: sSessions, reconnectSession: sReconnect } = useSftpStore.getState();
      for (const s of sSessions) {
        if (s.status === "error") void sReconnect(s.id);
      }
    });
    return () => { void unlisten.then((fn) => fn()); };
  }, []);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const meta = e.metaKey || e.ctrlKey;
    if (!meta) return;
    switch (e.key) {
      case "k":
        e.preventDefault();
        document.querySelector<HTMLInputElement>("[data-search-input]")?.focus();
        break;
      case "n":
        e.preventDefault();
        openAdd();
        break;
      case ",":
        e.preventDefault();
        openSettings();
        break;
    }
  }, [openAdd, openSettings]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Vault heartbeat — throttled to once per minute on user activity.
  // recordHeartbeat() mirrors the Rust-side last_vault_activity reset so
  // VaultCountdown can derive remaining time accurately.
  useEffect(() => {
    let lastBeat = 0;
    const beat = () => {
      const now = Date.now();
      if (now - lastBeat > 60_000) {
        lastBeat = now;
        recordHeartbeat();
        settingsCommands.vaultHeartbeat().catch(() => {});
      }
    };
    window.addEventListener("mousemove", beat, { passive: true });
    window.addEventListener("keydown", beat, { passive: true });
    return () => {
      window.removeEventListener("mousemove", beat);
      window.removeEventListener("keydown", beat);
    };
  }, []);

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
          {/* Server list / audit log */}
          <main
            className={`shrink-0 transition-[width,padding] duration-200 ${
              activeView === "audit"
                ? "flex-1 overflow-hidden flex flex-col"
                : hasPanel
                  ? serverListCollapsed
                    ? "w-0 p-0 overflow-hidden"
                    : "w-72 border-r border-stroke-subtle overflow-hidden flex flex-col"
                  : "flex-1 overflow-hidden flex flex-col"
            }`}
          >
            {activeView === "audit"
              ? <AuditLogView />
              : (
                <>
                  <div className="flex-1 overflow-y-auto p-5"><ServerList /></div>
                  {bulkMode && <BulkActionBar />}
                </>
              )}
          </main>

          {/* Collapse / expand handle */}
          {hasPanel && activeView !== "audit" && (
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
          {hasPanel && activeView !== "audit" && (
            <div className="flex flex-col flex-1 min-w-0">
              {/* Unified tab bar */}
              <div
                className="h-10 bg-surface-1 border-b border-stroke-subtle flex items-center gap-1 px-2 overflow-x-auto shrink-0"
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) resetDrag(); }}
                onDragEnd={resetDrag}
              >
                {terminalSessions.map((session) => (
                  <div
                    key={session.id}
                    draggable
                    onDragStart={handleDragStart(session.id, "terminal")}
                    onDragOver={handleDragOver(session.id, "terminal")}
                    onDrop={handleDrop(session.id, "terminal")}
                    onClick={() => { terminalSetActive(session.id); setActivePanelType("terminal"); }}
                    title={session.status === "error" && session.errorMessage ? session.errorMessage : undefined}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm cursor-pointer shrink-0 transition-colors select-none ${
                      activePanelType === "terminal" && session.id === terminalActiveId
                        ? "bg-accent/10 text-accent-fg"
                        : "text-muted hover:text-white hover:bg-surface-2"
                    } ${dragId === session.id ? "opacity-40" : ""} ${dragOverId === session.id && dragId !== session.id ? "ring-1 ring-inset ring-accent/50" : ""}`}
                  >
                    <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${TERMINAL_STATUS_COLORS[session.status]}`} />
                    <span className="max-w-[120px] truncate">{session.serverName}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); void terminalClose(session.id); }}
                      className="text-faint hover:text-white ml-1 leading-none transition-colors text-base"
                      aria-label={`Close ${session.serverName}`}
                    >×</button>
                  </div>
                ))}

                {/* Separator between terminal and SFTP tab groups */}
                {hasTerminal && hasSftp && (
                  <div className="w-px h-5 bg-stroke mx-1 shrink-0" />
                )}

                {sftpSessions.map((session) => (
                  <div
                    key={session.id}
                    draggable
                    onDragStart={handleDragStart(session.id, "sftp")}
                    onDragOver={handleDragOver(session.id, "sftp")}
                    onDrop={handleDrop(session.id, "sftp")}
                    onClick={() => { sftpSetActive(session.id); setActivePanelType("sftp"); }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm cursor-pointer shrink-0 transition-colors select-none ${
                      activePanelType === "sftp" && session.id === sftpActiveId
                        ? "bg-accent/10 text-accent-fg"
                        : "text-muted hover:text-white hover:bg-surface-2"
                    } ${dragId === session.id ? "opacity-40" : ""} ${dragOverId === session.id && dragId !== session.id ? "ring-1 ring-inset ring-accent/50" : ""}`}
                  >
                    <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${SFTP_STATUS_COLORS[session.status]}`} />
                    <svg className="w-3 h-3 text-accent-fg shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                    <span className="max-w-[120px] truncate">{session.serverName}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); void sftpClose(session.id); }}
                      className="text-faint hover:text-white ml-1 leading-none transition-colors text-base"
                      aria-label={`Close ${session.serverName} browser`}
                    >×</button>
                  </div>
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
