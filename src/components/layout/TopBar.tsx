import { useUiStore } from "../../store/uiStore";
import { useTerminalStore } from "../../store/terminalStore";
import { useSftpStore } from "../../store/sftpStore";

export default function TopBar() {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const activeView = useUiStore((s) => s.activeView);
  const openLogs = useUiStore((s) => s.openLogs);
  const closeForm = useUiStore((s) => s.closeForm);
  const openSettings = useUiStore((s) => s.openSettings);

  const terminalSessions = useTerminalStore((s) => s.sessions);
  const terminalActiveId = useTerminalStore((s) => s.activeSessionId);
  const sftpSessions = useSftpStore((s) => s.sessions);
  const sftpActiveId = useSftpStore((s) => s.activeSessionId);

  const activeSession =
    terminalSessions.find((s) => s.id === terminalActiveId) ??
    sftpSessions.find((s) => s.id === sftpActiveId);

  return (
    <header
        className="h-11 shrink-0 border-b border-stroke-subtle bg-surface-base flex items-center pl-[72px] pr-3"
      >
        <div className="flex-1 flex items-center justify-center pointer-events-none">
          <span className="text-sm text-secondary select-none">
            SSHelter{activeSession ? ` — ${activeSession.serverName}` : ""}
          </span>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
            className={`p-1.5 rounded transition-colors ${!sidebarCollapsed ? "text-white" : "text-dim hover:text-white hover:bg-surface-3"}`}
          >
            <svg className="w-[18px] h-[13px]" viewBox="0 0 18 13" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <rect x="0.75" y="0.75" width="16.5" height="11.5" rx="1.75" />
              <line x1="5.5" y1="0.75" x2="5.5" y2="12.25" />
            </svg>
          </button>

          <button
            onClick={() => activeView === "logs" ? closeForm() : openLogs()}
            aria-label="Audit log"
            className={`p-1.5 rounded transition-colors ${activeView === "logs" ? "text-white" : "text-dim hover:text-white hover:bg-surface-3"}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 8h6M9 16h4" />
              <rect x="3" y="3" width="18" height="18" rx="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <button
            onClick={() => openSettings()}
            aria-label="Settings"
            className="p-1.5 rounded text-dim hover:text-white hover:bg-surface-3 transition-colors ml-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
    </header>
  );
}
