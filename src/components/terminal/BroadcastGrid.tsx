import { useEffect, useMemo, useRef, useState } from "react";
import { terminalCommands } from "../../lib/tauriCommands";
import { useBroadcastStore } from "../../store/broadcastStore";
import { useTerminalStore } from "../../store/terminalStore";
import { usePlaybookStore } from "../../store/playbookStore";
import { usePlaybookRunStore } from "../../store/playbookRunStore";
import { useServerStore } from "../../store/serverStore";
import { resolvePlaybookStep } from "../../lib/playbookVariables";
import TerminalPane from "./TerminalPane";
import BroadcastGuardBar from "./BroadcastGuardBar";
import PlaybookRunBar from "./PlaybookRunBar";
import type { TerminalSession } from "../../store/terminalStore";
import type { Playbook } from "../../types/playbook";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

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

  const playbooks = usePlaybookStore((s) => s.playbooks);
  const fetchPlaybooks = usePlaybookStore((s) => s.fetchAll);
  const startPlaybookRun = usePlaybookRunStore((s) => s.start);

  const [playbookPickerOpen, setPlaybookPickerOpen] = useState(false);
  const [playbookQuery, setPlaybookQuery] = useState("");
  const playbookPickerRef = useRef<HTMLDivElement>(null);
  const playbookButtonRef = useRef<HTMLButtonElement>(null);

  const panes = useMemo(
    () => group?.sessionIds.map((id) => sessions.find((s) => s.id === id)).filter(Boolean) ?? [],
    [group, sessions],
  ) as TerminalSession[];

  const filteredPlaybooks = useMemo(() => {
    if (!playbookQuery.trim()) return playbooks;
    const q = playbookQuery.toLowerCase();
    return playbooks.filter(
      (pb) => pb.title.toLowerCase().includes(q) || pb.description?.toLowerCase().includes(q),
    );
  }, [playbooks, playbookQuery]);

  // Once the last pane in the group is closed, there's nothing left to broadcast to
  useEffect(() => {
    if (group && panes.length === 0) disbandGroup(group.id);
  }, [group, panes.length, disbandGroup]);

  useEffect(() => {
    void fetchPlaybooks();
  }, [fetchPlaybooks]);

  useEffect(() => {
    if (!playbookPickerOpen) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (playbookPickerRef.current?.contains(target)) return;
      if (playbookButtonRef.current?.contains(target)) return;
      setPlaybookPickerOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [playbookPickerOpen]);

  function openPlaybookPicker() {
    setPlaybookQuery("");
    setPlaybookPickerOpen((open) => !open);
  }

  function startBroadcastPlaybook(playbook: Playbook) {
    setPlaybookPickerOpen(false);
    if (!group) return;
    const targets = group.sessionIds
      .map((id) => sessions.find((s) => s.id === id))
      .filter((s): s is TerminalSession => s != null && !excludedSessionIds.has(s.id));

    startPlaybookRun(playbook, (raw) => raw, async (resolved) => {
      for (const session of targets) {
        const server = useServerStore.getState().servers.find((sv) => sv.id === session.serverId);
        const command = server ? resolvePlaybookStep(resolved, server) : resolved;
        await terminalCommands.sendTerminalInput(session.id, command + "\n");
      }
    });
  }

  if (!group) return null;

  const targetCount = panes.filter((s) => s && !excludedSessionIds.has(s.id)).length;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 py-2 border-b border-warning-subtle bg-warning-subtle flex items-center gap-2 shrink-0 text-xs">
        <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" aria-hidden="true" />
        <span className="text-warning font-semibold">Broadcasting to {targetCount} of {panes.length} hosts</span>
        <span className="text-faint">— keystrokes are sent to every unmuted pane</span>
        <div className="relative ml-auto">
          <Button
            ref={playbookButtonRef}
            variant="ghost"
            onClick={openPlaybookPicker}
            className="h-auto px-2 py-1 text-faint"
          >
            Run playbook
          </Button>
          {playbookPickerOpen && (
            <div
              ref={playbookPickerRef}
              className="absolute right-0 top-full mt-1 w-64 rounded border border-stroke bg-surface-2 shadow-lg z-20 text-sm"
            >
              <Input
                autoFocus
                value={playbookQuery}
                onChange={(e) => setPlaybookQuery(e.target.value)}
                placeholder="Search playbooks…"
                className="h-auto w-full rounded-none border-0 border-b bg-transparent px-2 py-1.5 border-stroke focus-visible:border-stroke"
              />
              <div className="max-h-64 overflow-y-auto">
                {filteredPlaybooks.length === 0 && (
                  <div className="px-2 py-3 text-faint text-center">No playbooks found</div>
                )}
                {filteredPlaybooks.map((playbook) => (
                  <Button
                    key={playbook.id}
                    variant="ghost"
                    onClick={() => startBroadcastPlaybook(playbook)}
                    className="h-auto w-full flex-col items-start rounded-none px-2 py-1.5"
                  >
                    <div className="text-secondary truncate">{playbook.title}</div>
                    {playbook.description && (
                      <div className="text-faint text-xs truncate">{playbook.description}</div>
                    )}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          onClick={() => disbandGroup(group.id)}
          className="h-auto px-2 py-1 text-faint"
        >
          Exit broadcast
        </Button>
      </div>

      <PlaybookRunBar />

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
                  <Button
                    variant="ghost"
                    onClick={() => toggleExcluded(session.id)}
                    title={isExcluded ? "Include in broadcast" : "Exclude from broadcast"}
                    aria-label={isExcluded ? `Include ${session.serverName} in broadcast` : `Exclude ${session.serverName} from broadcast`}
                    className={`h-auto px-1.5 py-0.5 ${
                      isExcluded ? "text-faint" : "text-accent-fg"
                    }`}
                  >
                    {isExcluded ? "Muted" : "Synced"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => void closeSession(session.id)}
                    title={`Close ${session.serverName}`}
                    aria-label={`Close ${session.serverName}`}
                    className="h-auto text-faint leading-none text-base px-1"
                  >
                    ×
                  </Button>
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
