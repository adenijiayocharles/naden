import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { terminalCommands, clipboardCommands } from "../../lib/tauriCommands";
import { sessionBuffer } from "../../lib/sessionBuffer";
import { useTerminalStore } from "../../store/terminalStore";
import { useTerminalSettings, fontCss } from "../../lib/terminalSettings";
import { ConnectingOverlay, ErrorOverlay, ReconnectingOverlay } from "../shared/ConnectionOverlay";

interface Props {
  sessionId: string;
}

export default function TerminalPane({ sessionId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
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
  const isDisconnected = session?.status === "disconnected";

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
    const { fontSize, scrollback, copyOnSelect, fontFamily } = useTerminalSettings.getState();

    const getTermTheme = () => {
      const root = document.documentElement;
      const bg = getComputedStyle(root).getPropertyValue("--color-surface-1").trim() || "#111111";
      const accent = getComputedStyle(root).getPropertyValue("--color-accent").trim() || "#CDFF00";
      const accentHover = getComputedStyle(root).getPropertyValue("--color-accent-hover").trim() || accent;
      const isLight = root.dataset.theme === "light";
      return {
        background: bg,
        foreground: isLight ? "#1e1e2e" : "#e0e0e0",
        cursor: accent,
        // In light mode the cursor is a coloured block — white text inside it reads fine
        cursorAccent: isLight ? "#ffffff" : "#000000",
        selectionBackground: `${accent}40`,
        // ANSI green (color 2) — used by default bash/zsh prompt for user@host
        green: accent,
        brightGreen: accentHover,
        // ANSI black is invisible on a light background without an override
        ...(isLight && {
          black: "#3c3c3c",
          brightBlack: "#6c6c6c",
        }),
      };
    };

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: fontCss(fontFamily),
      fontSize,
      scrollback,
      theme: getTermTheme(),
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    termRef.current = term;
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    searchAddonRef.current = searchAddon;

    term.open(containerRef.current);
    fitAddon.fit();
    term.focus();

    // xterm converts wheel events to ^[[A/^[[B cursor-key sequences when in the
    // alternate screen buffer (no scrollback). That's useful for TUI apps that
    // enable mouse tracking, but when mouse tracking is inactive the sequences go
    // to the PTY unhandled and the shell echoes them as literal text. Suppress the
    // conversion in that case — apps that need wheel input enable mouse tracking.
    term.attachCustomWheelEventHandler((_e) => {
      if (term.buffer.active.type === "alternate" && !term.element?.classList.contains("enable-mouse-events")) {
        return false;
      }
      return true;
    });

    // Copy selected text automatically when copyOnSelect is enabled (xterm v6 removed built-in option)
    const selectionDisposer = copyOnSelect
      ? term.onSelectionChange(() => {
          const sel = term.getSelection();
          if (sel) clipboardCommands.writeText(sel).catch(() => {});
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
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
      resizeTimer.current = setTimeout(() => {
        fitAddon.fit();
        const dims = fitAddon.proposeDimensions();
        if (dims) terminalCommands.resizeTerminal(sessionId, dims.cols, dims.rows).catch(() => {});
      }, 100);
    });
    resizeObserver.observe(containerRef.current);

    // Update terminal colours when the app theme or accent changes.
    const themeObserver = new MutationObserver(() => {
      term.options.theme = getTermTheme();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
      searchAddonRef.current = null;
      termRef.current = null;
      fitAddonRef.current = null;
      unsub();
      resizeObserver.disconnect();
      themeObserver.disconnect();
      dataDisposer.dispose();
      selectionDisposer?.dispose();
      term.dispose();
    };
  }, [sessionId]); // settings read via getState() intentionally — avoids recreating live sessions

  // Live-reload font size into open tabs whenever the setting changes.
  const fontSize = useTerminalSettings((s) => s.fontSize);
  useEffect(() => {
    const term = termRef.current;
    const fitAddon = fitAddonRef.current;
    if (!term || !fitAddon) return;
    term.options.fontSize = fontSize;
    fitAddon.fit();
  }, [fontSize]);

  return (
    <div className="relative h-full w-full bg-surface-1">
      <div ref={containerRef} className="absolute inset-4 overflow-hidden" />

      {/* Search bar — floats over terminal at top-right */}
      {searchVisible && (
        <div className="absolute top-3 right-4 z-30 flex items-center gap-1.5 bg-surface-3 border border-stroke rounded-lg shadow-2xl px-2.5 py-1.5">
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
        />
      )}
    </div>
  );
}
