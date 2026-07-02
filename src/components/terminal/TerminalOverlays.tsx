import { terminalCommands } from "../../lib/commands/terminal";
import { useServerStore } from "../../store/serverStore";
import { ConnectingOverlay, ErrorOverlay, ReconnectingOverlay } from "../shared/ConnectionOverlay";
import { Button } from "../ui/button";
import type { TerminalSession } from "../../store/terminalStore";

interface Props {
  sessionId: string;
  session: TerminalSession | undefined;
  isConnecting: boolean;
  isDisconnected: boolean;
  isError: boolean;
  confirmHostKey: (sessionId: string, accepted: boolean) => void;
  confirmHooks: (sessionId: string, accepted: boolean) => void;
  closeSession: (sessionId: string) => void;
  reconnectSession: (sessionId: string) => void;
}

export function TerminalOverlays({
  sessionId,
  session,
  isConnecting,
  isDisconnected,
  isError,
  confirmHostKey,
  confirmHooks,
  closeSession,
  reconnectSession,
}: Props) {
  return (
    <>
      {session?.hookConfirmPrompt && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-2 border border-stroke rounded-xl p-6 max-w-md w-full mx-4 shadow-overlay">
            <h3 className="text-base font-semibold text-white mb-2">Confirm connection hook</h3>
            <p className="text-sm text-text-muted mb-4">
              This server runs the command below{" "}
              {session.hookConfirmPrompt.postDisconnectHook && !session.hookConfirmPrompt.preConnectHook
                ? "after you disconnect"
                : "before connecting"}{" "}
              — new or changed since you last approved it. Review it before continuing.
            </p>
            {session.hookConfirmPrompt.preConnectHook && (
              <div className="mb-3">
                <span className="text-text-subtle text-xs block mb-1">Pre-connect</span>
                <div className="bg-surface-1 rounded-lg p-3 font-mono text-xs text-text-muted break-all">
                  {session.hookConfirmPrompt.preConnectHook}
                </div>
              </div>
            )}
            {session.hookConfirmPrompt.postDisconnectHook && (
              <div className="mb-4">
                <span className="text-text-subtle text-xs block mb-1">Post-disconnect</span>
                <div className="bg-surface-1 rounded-lg p-3 font-mono text-xs text-text-muted break-all">
                  {session.hookConfirmPrompt.postDisconnectHook}
                </div>
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" size="sm" onClick={() => { void confirmHooks(sessionId, false); }}>
                Cancel connection
              </Button>
              <Button size="sm" onClick={() => { void confirmHooks(sessionId, true); }}>
                Run &amp; connect
              </Button>
            </div>
          </div>
        </div>
      )}

      {session?.hostKeyPrompt && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-2 border border-stroke rounded-xl p-6 max-w-md w-full mx-4 shadow-overlay">
            <h3 className="text-base font-semibold text-white mb-2">Unknown host key</h3>
            <p className="text-sm text-text-muted mb-4">
              This is the first connection to{" "}
              <span className="text-white font-mono">
                {session.hostKeyPrompt.host}:{session.hostKeyPrompt.port}
              </span>
              . Verify the fingerprint out of band before accepting.
            </p>
            <div className="bg-surface-1 rounded-lg p-3 mb-4 font-mono text-xs text-text-muted break-all">
              <span className="text-text-subtle block mb-1">{session.hostKeyPrompt.keyType}</span>
              {session.hostKeyPrompt.fingerprint}
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" size="sm" onClick={() => { void confirmHostKey(sessionId, false); }}>
                Reject
              </Button>
              <Button size="sm" onClick={() => { void confirmHostKey(sessionId, true); }}>
                Accept &amp; Connect
              </Button>
            </div>
          </div>
        </div>
      )}

      {isConnecting && (
        <ConnectingOverlay
          serverName={session?.serverName ?? ""}
          onCancel={() => { void closeSession(sessionId); }}
        />
      )}
      {isDisconnected && session?.reconnectAt && (
        <ReconnectingOverlay
          reconnectAt={session.reconnectAt}
          onCancel={() => { void closeSession(sessionId); }}
        />
      )}
      {isError && (
        <ErrorOverlay
          errorMessage={session?.errorMessage}
          onReconnect={() => { void reconnectSession(sessionId); }}
          onClose={() => { void closeSession(sessionId); }}
          onRemoveKnownHost={() => {
            const server = useServerStore.getState().servers.find((sv) => sv.id === session?.serverId);
            if (!server) return;
            void terminalCommands.removeKnownHostEntry(server.id)
              .then(() => reconnectSession(sessionId));
          }}
        />
      )}
    </>
  );
}
