import { Button } from "../ui/button";
import SessionRecordingButton from "./SessionRecordingButton";
import type { TerminalSession } from "../../store/terminalStore";
import type { TerminalTool } from "../../store/terminalToolsStore";
import type { SftpSession } from "../../store/sftpStore";

interface Props {
  activeTerminalSession: TerminalSession | undefined;
  openTerminalTool: TerminalTool | null;
  toggleTerminalTool: (tool: TerminalTool) => void;
  linkedSftpSession: SftpSession | undefined;
  isSftpActive: boolean;
  onActivateSftp: (sessionId: string) => void;
  onOpenSftpForSession: (serverId: string, serverName: string) => void;
}

/**
 * Trailing toolbar buttons for the active terminal session: AI assistant,
 * playbook/snippet pickers, port-forward manager, session recording, and the
 * "open SFTP browser for this session" shortcut.
 */
export default function TerminalToolTriggers({
  activeTerminalSession,
  openTerminalTool,
  toggleTerminalTool,
  linkedSftpSession,
  isSftpActive,
  onActivateSftp,
  onOpenSftpForSession,
}: Props) {
  if (!activeTerminalSession) return null;

  return (
    <>
      <div className="px-1.5 shrink-0 border-l border-stroke-subtle flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          data-terminal-tool-trigger
          onClick={() => toggleTerminalTool("assistant")}
          title="AI assistant"
          aria-label="Open AI assistant"
          className={
            openTerminalTool === "assistant"
              ? "bg-accent/20 text-accent-fg"
              : "text-faint hover:text-white"
          }
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
            <path d="M20 3v4" />
            <path d="M22 5h-4" />
            <path d="M4 17v2" />
            <path d="M5 18H3" />
          </svg>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          data-terminal-tool-trigger
          onClick={() => toggleTerminalTool("playbooks")}
          title="Run a playbook"
          aria-label="Open playbook picker"
          className={
            openTerminalTool === "playbooks"
              ? "bg-accent/20 text-accent-fg"
              : "text-faint hover:text-white"
          }
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <polygon points="6,4 12,8 6,12" />
          </svg>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          data-terminal-tool-trigger
          onClick={() => toggleTerminalTool("snippets")}
          title="Run a snippet"
          aria-label="Open snippet picker"
          className={
            openTerminalTool === "snippets"
              ? "bg-accent/20 text-accent-fg"
              : "text-faint hover:text-white"
          }
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="12" height="12" rx="2" />
            <line x1="5" y1="5.5" x2="11" y2="5.5" />
            <line x1="5" y1="8" x2="11" y2="8" />
            <line x1="5" y1="10.5" x2="8" y2="10.5" />
          </svg>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          data-terminal-tool-trigger
          onClick={() => toggleTerminalTool("tunnels")}
          title="Manage port forwards"
          aria-label="Open port forward manager"
          className={
            openTerminalTool === "tunnels"
              ? "bg-accent/20 text-accent-fg"
              : "text-faint hover:text-white"
          }
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 8h4M10 8h4M6 5l-2 3 2 3M10 5l2 3-2 3" />
          </svg>
        </Button>
        <SessionRecordingButton
          sessionId={activeTerminalSession.id}
          serverId={activeTerminalSession.kind === "ssh" ? activeTerminalSession.serverId : undefined}
          serverName={activeTerminalSession.serverName ?? "Unknown"}
        />
      </div>

      {/* Open SFTP browser for the active terminal session — not
          applicable to local-shell sessions, which have no remote server */}
      {activeTerminalSession.kind === "ssh" && (
        <div className="px-1.5 shrink-0 border-l border-stroke-subtle">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              if (linkedSftpSession) {
                onActivateSftp(linkedSftpSession.id);
              } else {
                onOpenSftpForSession(activeTerminalSession.serverId, activeTerminalSession.serverName);
              }
            }}
            title="Open SFTP browser"
            aria-label="Open SFTP browser for this session"
            className={
              isSftpActive
                ? "bg-accent/20 text-accent-fg"
                : "text-faint hover:text-white"
            }
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4.5a1 1 0 0 1 1-1h2.5l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
            </svg>
          </Button>
        </div>
      )}
    </>
  );
}
