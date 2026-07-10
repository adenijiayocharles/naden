import { Button } from "../ui/button";
import TabItem from "./TabItem";
import type { TerminalSession, SessionStatus } from "../../store/terminalStore";
import type { SftpSession, SftpStatus } from "../../store/sftpStore";
import type { BroadcastGroup } from "../../store/broadcastStore";

type PanelType = "terminal" | "sftp";

const TERMINAL_STATUS_COLORS: Record<SessionStatus, string> = {
  connecting: "bg-yellow-500",
  connected: "bg-green-500",
  disconnected: "bg-dim",
  error: "bg-red-500",
};

const SFTP_STATUS_COLORS: Record<SftpStatus, string> = {
  connecting: "bg-yellow-500",
  connected: "bg-green-500",
  error: "bg-red-500",
};

const SFTP_FOLDER_ICON = (
  <svg className="w-3 h-3 text-accent-fg shrink-0" fill="currentColor" viewBox="0 0 20 20">
    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
  </svg>
);

interface Props {
  tabBarRef: React.RefObject<HTMLDivElement>;
  tabFade: { left: boolean; right: boolean };

  visibleTerminalSessions: TerminalSession[];
  activeBroadcastGroupId: string | null;
  activePanelType: PanelType;
  terminalActiveId: string | null;
  terminalSetActive: (id: string) => void;
  terminalClose: (id: string) => Promise<void>;
  terminalRename: (id: string, name: string) => void;

  broadcastGroups: BroadcastGroup[];
  disbandBroadcastGroup: (id: string) => void;
  setActiveBroadcastGroup: (id: string | null) => void;

  hasSftp: boolean;
  sftpSessions: SftpSession[];
  sftpActiveId: string | null;
  sftpSetActive: (id: string) => void;
  sftpClose: (id: string) => Promise<void>;

  onActivatePanel: (type: PanelType) => void;

  drag: { id: string; type: PanelType } | null;
  dragOverId: string | null;
  onDragStart: (id: string, type: PanelType, e: React.DragEvent) => void;
  onDragOver: (id: string, type: PanelType, e: React.DragEvent) => void;
  onDrop: (id: string, type: PanelType, e: React.DragEvent) => void;
}

/** The row of terminal/broadcast/SFTP tabs, with scroll-fade edges and drag-to-reorder. */
export default function SessionTabStrip({
  tabBarRef,
  tabFade,
  visibleTerminalSessions,
  activeBroadcastGroupId,
  activePanelType,
  terminalActiveId,
  terminalSetActive,
  terminalClose,
  terminalRename,
  broadcastGroups,
  disbandBroadcastGroup,
  setActiveBroadcastGroup,
  hasSftp,
  sftpSessions,
  sftpActiveId,
  sftpSetActive,
  sftpClose,
  onActivatePanel,
  drag,
  dragOverId,
  onDragStart,
  onDragOver,
  onDrop,
}: Props) {
  return (
    <div className="relative flex-1 min-w-0">
      {tabFade.left && (
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-surface-1 to-transparent flex items-center justify-start pl-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => tabBarRef.current?.scrollBy({ left: -120, behavior: "smooth" })}
            className="pointer-events-auto text-muted hover:text-white leading-none"
            aria-label="Scroll tabs left"
          >‹</Button>
        </div>
      )}
      {tabFade.right && (
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-surface-1 to-transparent flex items-center justify-end pr-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => tabBarRef.current?.scrollBy({ left: 120, behavior: "smooth" })}
            className="pointer-events-auto text-muted hover:text-white leading-none"
            aria-label="Scroll tabs right"
          >›</Button>
        </div>
      )}
      <div ref={tabBarRef} className="flex items-center gap-1 px-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
        {visibleTerminalSessions.map((session) => (
          <TabItem
            key={session.id}
            serverName={session.customName ?? session.serverName}
            statusColor={TERMINAL_STATUS_COLORS[session.status]}
            isActive={!activeBroadcastGroupId && activePanelType === "terminal" && session.id === terminalActiveId}
            isDragging={drag?.id === session.id}
            isDragOver={dragOverId === session.id && drag?.id !== session.id}
            title={
              session.status === "error" && session.errorMessage
                ? `${session.serverName} — ${session.errorMessage}`
                : session.customName
                  ? `${session.customName} (${session.serverName})`
                  : session.serverName
            }
            closeLabel={`Close ${session.serverName}`}
            onActivate={() => {
              terminalSetActive(session.id);
              onActivatePanel("terminal");
              setActiveBroadcastGroup(null);
            }}
            onClose={() => void terminalClose(session.id)}
            onRename={(name) => terminalRename(session.id, name)}
            onDragStart={(e) => onDragStart(session.id, "terminal", e)}
            onDragOver={(e) => onDragOver(session.id, "terminal", e)}
            onDrop={(e) => onDrop(session.id, "terminal", e)}
          />
        ))}

        {/* Broadcast group tabs — one per in-memory group, clickable to switch */}
        {broadcastGroups.length > 0 && (
          <>
            {visibleTerminalSessions.length > 0 && <div className="w-px h-5 bg-stroke mx-1 shrink-0" />}
            {broadcastGroups.map((group) => {
              const isActive = group.id === activeBroadcastGroupId;
              return (
                <div
                  key={group.id}
                  data-active={isActive ? "true" : undefined}
                  title={`Broadcast: ${group.name}`}
                  onClick={() => setActiveBroadcastGroup(group.id)}
                  className={`relative flex items-center gap-2 px-4 py-2.5 rounded text-base cursor-pointer shrink-0 transition-colors duration-200 ease-premium select-none ${
                    isActive ? "bg-surface-2 text-accent-fg" : "text-muted hover:text-white hover:bg-surface-2"
                  }`}
                >
                  {isActive && <span aria-hidden="true" className="absolute inset-x-3 bottom-0.5 h-0.5 rounded-full bg-accent" />}
                  <span className="inline-block w-2 h-2 rounded-full shrink-0 bg-yellow-500" />
                  <span className="max-w-[120px] truncate">{group.name}</span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={(e) => { e.stopPropagation(); disbandBroadcastGroup(group.id); }}
                    className="text-faint hover:text-white ml-1 leading-none text-base"
                    aria-label={`Exit broadcast: ${group.name}`}
                  >
                    ×
                  </Button>
                </div>
              );
            })}
          </>
        )}

        {/* Separator between terminal/broadcast side and SFTP tab groups */}
        {(visibleTerminalSessions.length > 0 || broadcastGroups.length > 0) && hasSftp && (
          <div className="w-px h-5 bg-stroke mx-1 shrink-0" />
        )}

        {sftpSessions.map((session) => (
          <TabItem
            key={session.id}
            serverName={session.serverName}
            statusColor={SFTP_STATUS_COLORS[session.status]}
            isActive={!activeBroadcastGroupId && activePanelType === "sftp" && session.id === sftpActiveId}
            isDragging={drag?.id === session.id}
            isDragOver={dragOverId === session.id && drag?.id !== session.id}
            title={session.serverName}
            icon={SFTP_FOLDER_ICON}
            closeLabel={`Close ${session.serverName} browser`}
            onActivate={() => {
              sftpSetActive(session.id);
              onActivatePanel("sftp");
              setActiveBroadcastGroup(null);
            }}
            onClose={() => void sftpClose(session.id)}
            onDragStart={(e) => onDragStart(session.id, "sftp", e)}
            onDragOver={(e) => onDragOver(session.id, "sftp", e)}
            onDrop={(e) => onDrop(session.id, "sftp", e)}
          />
        ))}
      </div>
    </div>
  );
}
