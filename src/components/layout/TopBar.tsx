import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useUiStore } from "../../store/uiStore";
import { useTerminalStore } from "../../store/terminalStore";
import { useSftpStore } from "../../store/sftpStore";

export default function TopBar() {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const activeView = useUiStore((s) => s.activeView);
  const openLogs = useUiStore((s) => s.openLogs);
  const closeForm = useUiStore((s) => s.closeForm);

  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

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
            SSHelter
            {appVersion && <span className="text-dim"> v{appVersion}</span>}
            {activeSession ? ` — ${activeSession.serverName}` : ""}
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
        </div>
    </header>
  );
}
