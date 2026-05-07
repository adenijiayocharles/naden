import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { terminalCommands } from "../../lib/tauriCommands";
import { useTerminalStore } from "../../store/terminalStore";

interface Props {
  sessionId: string;
  isActive: boolean;
}

export default function TerminalPane({ sessionId, isActive }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  // Always-current ref so event callbacks don't capture a stale isActive
  const isActiveRef = useRef(isActive);
  const setStatus = useTerminalStore((s) => s.setStatus);
  const removeSession = useTerminalStore((s) => s.removeSession);
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  // Re-fit and focus whenever this tab becomes the active one
  useEffect(() => {
    if (!isActive) return;
    const raf = requestAnimationFrame(() => {
      fitAddonRef.current?.fit();
      termRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [isActive]);

  // Mount once per sessionId — stays alive for the lifetime of the session
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "JetBrains Mono, Menlo, Consolas, monospace",
      fontSize: 14,
      theme: {
        background: "#0d0d0d",
        foreground: "#e0e0e0",
        cursor: "#CDFF00",
        cursorAccent: "#000000",
        selectionBackground: "#CDFF0030",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    // Only fit if visible; if hidden dimensions are 0 and fit would miscalculate
    if (isActiveRef.current) fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const dataDisposer = term.onData((data) => {
      terminalCommands.sendTerminalInput(sessionId, data).catch(() => {});
    });

    // Rate-limit resize events to ≤1/100ms (xterm fires continuously during drag)
    const observer = new ResizeObserver(() => {
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
      resizeTimer.current = setTimeout(() => {
        fitAddon.fit();
        const dims = fitAddon.proposeDimensions();
        if (dims) {
          terminalCommands
            .resizeTerminal(sessionId, dims.cols, dims.rows)
            .catch(() => {});
        }
      }, 100);
    });
    observer.observe(containerRef.current);

    let unlistenOutput: UnlistenFn | undefined;
    let unlistenStatus: UnlistenFn | undefined;
    let unlistenClosed: UnlistenFn | undefined;
    let unlistenError: UnlistenFn | undefined;

    void (async () => {
      unlistenOutput = await listen<string>(`terminal:output:${sessionId}`, (event) => {
        const binary = atob(event.payload);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        term.write(bytes);
      });

      unlistenStatus = await listen<string>(`terminal:status:${sessionId}`, (event) => {
        if (event.payload === "connected") {
          setStatus(sessionId, "connected");
          if (isActiveRef.current) term.focus();
        }
      });

      unlistenClosed = await listen<null>(`terminal:closed:${sessionId}`, () => {
        removeSession(sessionId);
      });

      unlistenError = await listen<string>(`terminal:error:${sessionId}`, (event) => {
        setStatus(sessionId, "error", event.payload);
        term.writeln(`\r\n\x1b[31m[Error: ${event.payload}]\x1b[0m`);
        closeTimer.current = setTimeout(() => removeSession(sessionId), 3000);
      });
    })();

    return () => {
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
      if (closeTimer.current) clearTimeout(closeTimer.current);
      observer.disconnect();
      dataDisposer.dispose();
      unlistenOutput?.();
      unlistenStatus?.();
      unlistenClosed?.();
      unlistenError?.();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId, setStatus, removeSession]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-[#0d0d0d]"
      style={{ padding: "4px" }}
    />
  );
}
