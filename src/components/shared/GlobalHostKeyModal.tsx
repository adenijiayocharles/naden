import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTerminalStore } from "../../store/terminalStore";
import { terminalCommands } from "../../lib/commands/terminal";
import { Button } from "../ui/button";

interface HostKeyPrompt {
  sessionId: string;
  host: string;
  port: number;
  fingerprint: string;
  keyType: string;
}

// Handles host key prompts for SFTP and tunnel sessions — terminal sessions
// are handled by the per-pane overlay in TerminalPane.tsx via terminalStore.
export default function GlobalHostKeyModal() {
  const [prompt, setPrompt] = useState<HostKeyPrompt | null>(null);

  useEffect(() => {
    const unlisten = listen<{
      session_id: string;
      host: string;
      port: number;
      fingerprint: string;
      key_type: string;
    }>("ssh:host-key-prompt", ({ payload }) => {
      const terminalSessions = useTerminalStore.getState().sessions;
      if (terminalSessions.find((s) => s.id === payload.session_id)) return;
      setPrompt({
        sessionId: payload.session_id,
        host: payload.host,
        port: payload.port,
        fingerprint: payload.fingerprint,
        keyType: payload.key_type,
      });
    });
    return () => { void unlisten.then((fn) => fn()); };
  }, []);

  if (!prompt) return null;

  const confirm = async (accepted: boolean) => {
    setPrompt(null);
    await terminalCommands.confirmHostKey(prompt.sessionId, accepted);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-2 border border-stroke rounded-xl p-6 max-w-md w-full mx-4 shadow-overlay">
        <h3 className="text-base font-semibold text-white mb-2">Unknown host key</h3>
        <p className="text-sm text-text-muted mb-4">
          This is the first connection to{" "}
          <span className="text-white font-mono">{prompt.host}:{prompt.port}</span>.
          Verify the fingerprint out of band before accepting.
        </p>
        <div className="bg-surface-1 rounded-lg p-3 mb-4 font-mono text-xs text-text-muted break-all">
          <span className="text-text-subtle block mb-1">{prompt.keyType}</span>
          {prompt.fingerprint}
        </div>
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" size="sm" onClick={() => { void confirm(false); }}>
            Reject
          </Button>
          <Button size="sm" onClick={() => { void confirm(true); }}>
            Accept &amp; Connect
          </Button>
        </div>
      </div>
    </div>
  );
}
