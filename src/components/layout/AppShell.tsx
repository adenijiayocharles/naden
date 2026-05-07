import { useEffect } from "react";
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

export default function AppShell() {
  const fetchAll = useServerStore((s) => s.fetchAll);
  const activeView = useUiStore((s) => s.activeView);
  const { isSetup, isUnlocked, isChecking, setupDismissed, check } = useVaultStore();
  const sessions = useTerminalStore((s) => s.sessions);
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const hasTerminal = sessions.length > 0;

  useEffect(() => {
    void fetchAll();
    void check();
  }, [fetchAll, check]);

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
          {/* Server list — collapses to a fixed width when terminal is open */}
          <main
            className={`overflow-y-auto p-5 shrink-0 ${
              hasTerminal ? "w-72 border-r border-[#1e1e1e]" : "flex-1"
            }`}
          >
            <ServerList />
          </main>

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
      {!isSetup && !setupDismissed && <VaultSetupModal />}
    </div>
  );
}
