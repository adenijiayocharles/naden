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
  const serverListCollapsed = useUiStore((s) => s.serverListCollapsed);
  const toggleServerList = useUiStore((s) => s.toggleServerList);
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
          {/* Server list */}
          <main
            className={`overflow-y-auto shrink-0 transition-[width,padding] duration-200 ${
              hasTerminal
                ? serverListCollapsed
                  ? "w-0 p-0 overflow-hidden"
                  : "w-72 p-5 border-r border-[#1e1e1e]"
                : "flex-1 p-5"
            }`}
          >
            <ServerList />
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
      {!isSetup && !setupDismissed && <VaultSetupModal />}
    </div>
  );
}
