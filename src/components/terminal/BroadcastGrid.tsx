import { useEffect, useMemo } from "react";
import { useBroadcastStore } from "../../store/broadcastStore";
import { useTerminalStore } from "../../store/terminalStore";
import TerminalPane from "./TerminalPane";
import BroadcastGuardBar from "./BroadcastGuardBar";

interface Props {
  groupId: string;
}

function gridColumns(count: number) {
  if (count <= 1) return "grid-cols-1";
  if (count <= 2) return "grid-cols-2";
  if (count <= 4) return "grid-cols-2";
  if (count <= 6) return "grid-cols-3";
  return "grid-cols-3 xl:grid-cols-4";
}

export default function BroadcastGrid({ groupId }: Props) {
  const group = useBroadcastStore((s) => s.groups.find((g) => g.id === groupId));
  const disbandGroup = useBroadcastStore((s) => s.disbandGroup);
  const excludedSessionIds = useBroadcastStore((s) => s.excludedSessionIds);
  const toggleExcluded = useBroadcastStore((s) => s.toggleExcluded);
  const pendingInput = useBroadcastStore((s) => s.pendingInput);
  const confirmPendingInput = useBroadcastStore((s) => s.confirmPendingInput);
  const cancelPendingInput = useBroadcastStore((s) => s.cancelPendingInput);
  const sessions = useTerminalStore((s) => s.sessions);
  const closeSession = useTerminalStore((s) => s.closeSession);

  const panes = useMemo(
    () => group?.sessionIds.map((id) => sessions.find((s) => s.id === id)).filter(Boolean) ?? [],
    [group, sessions],
  );

  // Once the last pane in the group is closed, there's nothing left to broadcast to
  useEffect(() => {
    if (group && panes.length === 0) disbandGroup(group.id);
  }, [group, panes.length, disbandGroup]);

  if (!group) return null;

  const targetCount = panes.filter((s) => s && !excludedSessionIds.has(s.id)).length;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 py-2 border-b border-accent/40 bg-accent/5 flex items-center gap-2 shrink-0 text-xs">
        <span className="w-2 h-2 rounded-full bg-accent shrink-0" aria-hidden="true" />
        <span className="text-accent-fg font-semibold">Broadcasting to {targetCount} of {panes.length} hosts</span>
        <span className="text-faint">— keystrokes are sent to every unmuted pane</span>
        <button
          onClick={() => disbandGroup(group.id)}
          className="ml-auto px-2 py-1 rounded text-faint hover:text-white hover:bg-surface-3 transition-colors"
        >
          Exit broadcast
        </button>
      </div>

      {pendingInput !== null && (
        <BroadcastGuardBar
          hostCount={targetCount}
          pendingInput={pendingInput}
          onConfirm={() => void confirmPendingInput()}
          onCancel={cancelPendingInput}
        />
      )}

      <div className={`flex-1 min-h-0 grid ${gridColumns(panes.length)} gap-1 p-1 bg-stroke`}>
        {panes.map((session) => {
          if (!session) return null;
          const isExcluded = excludedSessionIds.has(session.id);
          return (
            <div
              key={session.id}
              className={`relative flex flex-col min-h-0 rounded overflow-hidden border ${
                isExcluded ? "border-stroke opacity-50" : "border-accent/50"
              }`}
            >
              <div className="flex items-center justify-between px-2 py-1 bg-surface-2 text-xs shrink-0">
                <span className="truncate text-secondary">{session.serverName}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleExcluded(session.id)}
                    title={isExcluded ? "Include in broadcast" : "Exclude from broadcast"}
                    aria-label={isExcluded ? `Include ${session.serverName} in broadcast` : `Exclude ${session.serverName} from broadcast`}
                    className={`px-1.5 py-0.5 rounded transition-colors ${
                      isExcluded ? "text-faint hover:text-white" : "text-accent-fg hover:text-white"
                    }`}
                  >
                    {isExcluded ? "Muted" : "Synced"}
                  </button>
                  <button
                    onClick={() => void closeSession(session.id)}
                    title={`Close ${session.serverName}`}
                    aria-label={`Close ${session.serverName}`}
                    className="text-faint hover:text-white leading-none transition-colors text-base px-1"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <TerminalPane sessionId={session.id} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
