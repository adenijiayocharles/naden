import { useEffect, useCallback } from "react";
import { useServerStore } from "../../store/serverStore";
import { useUiStore } from "../../store/uiStore";
import { useVaultStore } from "../../store/vaultStore";
import { useTerminalStore } from "../../store/terminalStore";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import ServerList from "../servers/ServerList";
import ServerForm from "../servers/ServerForm";
import VaultLockScreen from "../vault/VaultLockScreen";
import VaultSetupModal from "../vault/VaultSetupModal";
import TerminalPane from "../terminal/TerminalPane";
import TerminalTabs from "../terminal/TerminalTabs";
import AuditLogView from "../audit/AuditLogView";
import OnboardingWizard from "../onboarding/OnboardingWizard";
import { settingsCommands } from "../../lib/tauriCommands";
import { useTerminalSettings } from "../../lib/terminalSettings";

export default function AppShell() {
  const fetchAll = useServerStore((s) => s.fetchAll);
  const activeView = useUiStore((s) => s.activeView);
  const serverListCollapsed = useUiStore((s) => s.serverListCollapsed);
  const toggleServerList = useUiStore((s) => s.toggleServerList);
  const openAdd = useUiStore((s) => s.openAdd);
  const openSettings = useUiStore((s) => s.openSettings);
  const onboardingComplete = useUiStore((s) => s.onboardingComplete);
  const onboardingChecked = useUiStore((s) => s.onboardingChecked);
  const setOnboardingComplete = useUiStore((s) => s.setOnboardingComplete);
  const setOnboardingChecked = useUiStore((s) => s.setOnboardingChecked);
  const { isSetup, isUnlocked, isChecking, setupDismissed, check } = useVaultStore();
  const loadTerminalSettings = useTerminalSettings((s) => s.load);
  const sessions = useTerminalStore((s) => s.sessions);
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const hasTerminal = sessions.length > 0;


  useEffect(() => {
    void fetchAll();
    void check();
    void loadTerminalSettings();
    // Check onboarding once on mount
    settingsCommands.getSetting("onboarding_complete")
      .then((v) => {
        setOnboardingComplete(v === "true");
        setOnboardingChecked();
      })
      .catch(() => { setOnboardingChecked(); });
  }, [fetchAll, check, loadTerminalSettings, setOnboardingComplete, setOnboardingChecked]);

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

  // Vault heartbeat — throttled to once per minute on user activity
  useEffect(() => {
    let lastBeat = 0;
    const beat = () => {
      const now = Date.now();
      if (now - lastBeat > 60_000) {
        lastBeat = now;
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
      <div className="flex h-screen items-center justify-center bg-black text-[#777] text-sm">
        Loading…
      </div>
    );
  }

  if (isSetup && !isUnlocked) return <VaultLockScreen />;

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0">
        <TopBar />
        <div className="flex flex-1 min-h-0">
          {/* Server list / audit log */}
          <main
            className={`shrink-0 transition-[width,padding] duration-200 ${
              hasTerminal
                ? serverListCollapsed
                  ? "w-0 p-0 overflow-hidden"
                  : "w-72 border-r border-[#1e1e1e] overflow-hidden flex flex-col"
                : "flex-1 overflow-hidden flex flex-col"
            }`}
          >
            {activeView === "audit"
              ? <AuditLogView />
              : <div className="flex-1 overflow-y-auto p-5"><ServerList /></div>}
          </main>

          {/* Collapse / expand handle — only visible when terminal is open */}
          {hasTerminal && (
            <button
              onClick={toggleServerList}
              aria-label={serverListCollapsed ? "Expand server list" : "Collapse server list"}
              className="w-4 shrink-0 flex items-center justify-center bg-[#0a0a0a] border-r border-[#1e1e1e] hover:bg-[#161616] transition-colors group"
            >
              <svg
                className="w-2.5 h-2.5 text-[#333] group-hover:text-[#888] transition-colors"
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

          {/* Built-in terminal panel */}
          {hasTerminal && (
            <div className="flex flex-col flex-1 min-w-0">
              <TerminalTabs />
              <div className="flex-1 min-h-0">
                {activeSessionId && (
                  <TerminalPane key={activeSessionId} sessionId={activeSessionId} />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {(activeView === "add" || activeView === "edit") && <ServerForm />}
      {!isSetup && !setupDismissed && onboardingComplete && <VaultSetupModal />}
      {onboardingChecked && !onboardingComplete && (
        <OnboardingWizard onComplete={() => setOnboardingComplete(true)} />
      )}
    </div>
  );
}
