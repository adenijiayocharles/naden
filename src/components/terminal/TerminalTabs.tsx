import { useTerminalStore, type SessionStatus } from "../../store/terminalStore";

const STATUS_COLORS: Record<SessionStatus, string> = {
  connecting: "bg-yellow-500",
  connected: "bg-[#CDFF00]",
  disconnected: "bg-[#444]",
  error: "bg-red-500",
};

function StatusDot({ status }: { status: SessionStatus }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[status]}`} />
  );
}

export default function TerminalTabs() {
  const sessions = useTerminalStore((s) => s.sessions);
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const setActive = useTerminalStore((s) => s.setActive);
  const closeSession = useTerminalStore((s) => s.closeSession);

  return (
    <div className="h-10 bg-surface-1 border-b border-stroke-subtle flex items-center gap-1 px-2 overflow-x-auto shrink-0">
      {sessions.map((session) => (
        <div
          key={session.id}
          onClick={() => setActive(session.id)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm cursor-pointer shrink-0 transition-colors select-none ${
            session.id === activeSessionId
              ? "bg-surface-4 text-white"
              : "text-muted hover:text-white hover:bg-surface-2"
          }`}
        >
          <StatusDot status={session.status} />
          <span className="max-w-[140px] truncate">{session.serverName}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              void closeSession(session.id);
            }}
            className="text-faint hover:text-white ml-1 leading-none transition-colors text-base"
            aria-label={`Close ${session.serverName}`}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
