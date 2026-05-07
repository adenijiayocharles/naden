import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { terminalCommands } from "../../lib/tauriCommands";
import { sessionBuffer } from "../../lib/sessionBuffer";

interface Props {
  sessionId: string;
}

export default function TerminalPane({ sessionId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    fitAddon.fit();
    term.focus();

    // Replay buffered output then subscribe to live bytes — race-free because
    // subscribeAndReplay sets the subscriber before snapshotting the buffer
    const { chunks, unsub } = sessionBuffer.subscribeAndReplay(sessionId, (data) =>
      term.write(data),
    );
    for (const chunk of chunks) term.write(chunk);

    const dataDisposer = term.onData((data) => {
      terminalCommands.sendTerminalInput(sessionId, data).catch(() => {});
    });

    // Rate-limit PTY resize to ≤1/100ms (xterm fires continuously during drag)
    const observer = new ResizeObserver(() => {
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
      resizeTimer.current = setTimeout(() => {
        fitAddon.fit();
        const dims = fitAddon.proposeDimensions();
        if (dims) terminalCommands.resizeTerminal(sessionId, dims.cols, dims.rows).catch(() => {});
      }, 100);
    });
    observer.observe(containerRef.current);

    return () => {
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
      unsub();
      observer.disconnect();
      dataDisposer.dispose();
      term.dispose();
    };
  }, [sessionId]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-[#0d0d0d]"
      style={{ padding: "4px" }}
    />
  );
}
