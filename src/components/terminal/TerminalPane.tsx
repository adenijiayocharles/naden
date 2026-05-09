import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { terminalCommands } from "../../lib/tauriCommands";
import { sessionBuffer } from "../../lib/sessionBuffer";
import { useTerminalStore } from "../../store/terminalStore";
import { useTerminalSettings } from "../../lib/terminalSettings";

interface Props {
  sessionId: string;
}

export default function TerminalPane({ sessionId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const searchVisibleRef = useRef(false);

  const session = useTerminalStore((s) => s.sessions.find((t) => t.id === sessionId));
  const closeSession = useTerminalStore((s) => s.closeSession);
  const reconnectSession = useTerminalStore((s) => s.reconnectSession);

  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const isConnecting = session?.status === "connecting";
  const isError = session?.status === "error";

  // Keep ref in sync so xterm's key handler (a stale closure) can read current value
  useEffect(() => { searchVisibleRef.current = searchVisible; }, [searchVisible]);

  const closeSearch = useCallback(() => {
    setSearchVisible(false);
    setSearchQuery("");
  }, []);

  const findNext = useCallback(() => {
    if (searchQuery) searchAddonRef.current?.findNext(searchQuery, { incremental: false });
  }, [searchQuery]);

  const findPrevious = useCallback(() => {
    if (searchQuery) searchAddonRef.current?.findPrevious(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Read settings at terminal creation time — changes apply to new sessions
    const { fontSize, scrollback, copyOnSelect } = useTerminalSettings.getState();

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "JetBrains Mono, Menlo, Consolas, monospace",
      fontSize,
      scrollback,
      theme: {
        background: "#0d0d0d",
        foreground: "#e0e0e0",
        cursor: "#CDFF00",
        cursorAccent: "#000000",
        selectionBackground: "#CDFF0030",
      },
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    searchAddonRef.current = searchAddon;

    term.open(containerRef.current);
    fitAddon.fit();
    term.focus();

    // Copy selected text automatically when copyOnSelect is enabled (xterm v6 removed built-in option)
    const selectionDisposer = copyOnSelect
      ? term.onSelectionChange(() => {
          const sel = term.getSelection();
          if (sel) navigator.clipboard.writeText(sel).catch(() => {});
        })
      : null;

    // Intercept Ctrl/Cmd+F to open search; Escape to close it when open
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        setSearchVisible(true);
        return false;
      }
      if (e.key === "Escape" && searchVisibleRef.current) {
        setSearchVisible(false);
        setSearchQuery("");
        return false;
      }
      return true;
    });

    // Replay buffered output then subscribe to live bytes — race-free because
    // subscribeAndReplay sets the subscriber before snapshotting the buffer
    const { chunks, unsub } = sessionBuffer.subscribeAndReplay(sessionId, (data) =>
      term.write(data),
    );
    if (chunks.length === 1) {
      term.write(chunks[0]);
    } else if (chunks.length > 1) {
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const combined = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { combined.set(c, off); off += c.length; }
      term.write(combined);
    }

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
      searchAddonRef.current = null;
      unsub();
      observer.disconnect();
      dataDisposer.dispose();
      selectionDisposer?.dispose();
      term.dispose();
    };
  }, [sessionId]); // settings read via getState() intentionally — avoids recreating live sessions

  return (
    <div className="relative h-full w-full bg-surface-0">
      <div ref={containerRef} className="h-full w-full" style={{ padding: "15px" }} />

      {/* Search bar — floats over terminal at top-right */}
      {searchVisible && (
        <div className="absolute top-3 right-4 z-30 flex items-center gap-1.5 bg-surface-3 border border-[#333] rounded-lg shadow-2xl px-2.5 py-1.5">
          <input
            autoFocus
            type="text"
            value={searchQuery}
            onChange={(e) => {
              const q = e.target.value;
              setSearchQuery(q);
              if (q) searchAddonRef.current?.findNext(q, { incremental: true });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.shiftKey ? findPrevious() : findNext(); }
              else if (e.key === "Escape") { closeSearch(); }
            }}
            placeholder="Find in terminal…"
            className="bg-transparent text-sm text-white placeholder-[#555] outline-none w-44"
          />
          <button onClick={findPrevious} title="Previous (Shift+Enter)"
            className="text-muted hover:text-white px-1 text-sm leading-none">↑</button>
          <button onClick={findNext} title="Next (Enter)"
            className="text-muted hover:text-white px-1 text-sm leading-none">↓</button>
          <button onClick={closeSearch} aria-label="Close search"
            className="text-faint hover:text-white px-1 text-base leading-none ml-0.5">×</button>
        </div>
      )}

      {/* Connecting overlay */}
      {isConnecting && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-0 gap-4">
          <p className="text-faint text-sm tracking-wide">
            Connecting to{" "}
            <span className="text-white font-medium">{session?.serverName}</span>…
          </p>
          <div className="relative w-48 h-0.5 bg-surface-4 rounded-full overflow-hidden">
            <div
              className="absolute top-0 h-full bg-accent rounded-full"
              style={{ animation: "progress-slide 1.2s ease-in-out infinite" }}
            />
          </div>
          <button
            onClick={() => { void closeSession(sessionId); }}
            className="bg-accent hover:bg-accent-hover text-black text-sm font-semibold px-4 py-1.5 rounded transition-colors mt-2"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Error overlay — user can reconnect or close the tab */}
      {isError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-0/95 gap-4">
          <p className="text-red-400 text-sm font-medium">Connection failed</p>
          {session?.errorMessage && (
            <p className="text-faint text-xs max-w-xs text-center">{session.errorMessage}</p>
          )}
          <div className="flex gap-3 mt-1">
            <button
              onClick={() => { void reconnectSession(sessionId); }}
              className="px-4 py-2 text-sm text-black bg-accent hover:bg-accent-hover rounded font-semibold transition-colors"
            >
              Reconnect
            </button>
            <button
              onClick={() => { void closeSession(sessionId); }}
              className="px-4 py-2 text-sm text-muted hover:text-white bg-surface-3 hover:bg-surface-4 rounded transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
