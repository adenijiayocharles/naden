import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { terminalCommands, clipboardCommands } from "../../lib/tauriCommands";
import { sessionBuffer } from "../../lib/sessionBuffer";
import { useTerminalStore } from "../../store/terminalStore";
import { useTerminalSettings, fontCss } from "../../lib/terminalSettings";
import { ensureCanvasFonts, ensureFont } from "../../lib/canvasFonts";
import { ConnectingOverlay, ErrorOverlay, ReconnectingOverlay } from "../shared/ConnectionOverlay";
import { useSnippetStore } from "../../store/snippetStore";

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
  const [searchResults, setSearchResults] = useState<{ index: number | undefined; count: number } | null>(null);
  const [snippetPickerOpen, setSnippetPickerOpen] = useState(false);
  const [snippetQuery, setSnippetQuery] = useState("");
  const snippetPickerRef = useRef<HTMLDivElement>(null);
  const snippetButtonRef = useRef<HTMLButtonElement>(null);

  const snippets = useSnippetStore((s) => s.snippets);
  const fetchSnippets = useSnippetStore((s) => s.fetchAll);
  // Ref mirror of searchQuery so findNext/findPrevious always read the latest
  // value without needing searchQuery in their dependency arrays. If they closed
  // over state, a stale value would mismatch xterm's cachedSearchTerm and cause
  // findNextWithSelection to restart from the start of the current match instead
  // of advancing past it.
  const searchQueryRef = useRef("");
  // Tracks the last found match position so navigation survives selection being
  // cleared by incoming SSH output between the typing call and Enter/button press.
  // getSelectionPosition() returns 1-based coords; terminal.select() takes 0-based.
  const lastFoundRef = useRef<{ col: number; row: number } | null>(null);

  const isConnecting = session?.status === "connecting";
  const isError = session?.status === "error";
  const isDisconnected = session?.status === "disconnected";

  // Keep ref in sync so xterm's key handler (a stale closure) can read current value
  useEffect(() => { searchVisibleRef.current = searchVisible; }, [searchVisible]);

  const closeSearch = useCallback(() => {
    setSearchVisible(false);
    setSearchQuery("");
    searchQueryRef.current = "";
    setSearchResults(null);
    lastFoundRef.current = null;
  }, []);

  const findNext = useCallback(() => {
    const term = termRef.current;
    const addon = searchAddonRef.current;
    const q = searchQueryRef.current;
    if (!q || !addon) return;
    // Restore selection if SSH output cleared it so the addon knows where to advance from
    if (term && !term.hasSelection() && lastFoundRef.current) {
      term.select(lastFoundRef.current.col, lastFoundRef.current.row, q.length);
    }
    addon.findNext(q, { incremental: false });
    const pos = term?.getSelectionPosition();
    if (pos) lastFoundRef.current = { col: pos.start.x - 1, row: pos.start.y - 1 };
  }, []);

  const findPrevious = useCallback(() => {
    const term = termRef.current;
    const addon = searchAddonRef.current;
    const q = searchQueryRef.current;
    if (!q || !addon) return;
    if (term && !term.hasSelection() && lastFoundRef.current) {
      term.select(lastFoundRef.current.col, lastFoundRef.current.row, q.length);
    }
    addon.findPrevious(q);
    const pos = term?.getSelectionPosition();
    if (pos) lastFoundRef.current = { col: pos.start.x - 1, row: pos.start.y - 1 };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    let teardown: (() => void) | null = null;

    const run = async () => {
      // Wait for window.load so CSS @font-face rules are registered — the generated
      // HTML places <script type="module"> before <link rel="stylesheet">, so any
      // document.fonts call made before load silently no-ops in WKWebView.
      if (document.readyState !== "complete") {
        await new Promise<void>((r) =>
          window.addEventListener("load", () => r(), { once: true })
        );
      }

      // Read settings after the await — load() may have finished during the wait,
      // giving us the user's saved font rather than the store default.
      const { fontSize, scrollback, copyOnSelect, fontFamily } =
        useTerminalSettings.getState();
      const css = fontCss(fontFamily);

      // Ensure the default font is loaded, then the selected font, before
      // creating the terminal so xterm measures Canvas metrics against the real
      // font from the start — not the system fallback.
      await ensureCanvasFonts();
      await ensureFont(fontFamily);

      if (cancelled || !containerRef.current) return;

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
        fontFamily: css,
        fontSize,
        scrollback,
        theme: getTermTheme(),
      });

      const fitAddon = new FitAddon();
      const searchAddon = new SearchAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(searchAddon);
      searchAddon.onDidChangeResults((r) => {
        setSearchResults(r.resultCount > 0 ? { index: r.resultIndex, count: r.resultCount } : null);
      });

      term.open(containerRef.current);
      fitAddon.fit();
      term.focus();

      // Two-frame post-open correction for WKWebView production builds:
      //
      // Frame 1 — force xterm to re-measure char sizes and re-inject CSS:
      //   (a) term.options spread with fontFamily forces CharSizeService.measure()
      //       to run again with the now-confirmed-loaded font.  On tauri:// the
      //       font may have just finished its CSS @font-face download, so the
      //       initial measure() inside term.open() could have used the fallback.
      //   (b) term.options.theme re-triggers xterm's cursor-blink CSS injection.
      //       The dynamically-created <style>.sheet is null during the sync setup
      //       tick on tauri://, so insertRule() silently no-ops the first time.
      //
      // Frame 2 — re-fit after correct char metrics are applied.
      requestAnimationFrame(() => {
        if (cancelled) return;
        term.options.fontFamily = css;
        term.options.theme = getTermTheme();
        requestAnimationFrame(() => {
          if (cancelled) return;
          fitAddon.fit();
        });
      });

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

      // Wire up refs only after full setup so the live-font effect and other
      // consumers can't access a partially-initialised terminal.
      termRef.current = term;
      fitAddonRef.current = fitAddon;
      searchAddonRef.current = searchAddon;

      teardown = () => {
        if (resizeTimer.current) clearTimeout(resizeTimer.current);
        resizeObserver.disconnect();
        themeObserver.disconnect();
        unsub();
        dataDisposer.dispose();
        selectionDisposer?.dispose();
        searchAddonRef.current = null;
        termRef.current = null;
        fitAddonRef.current = null;
        term.dispose();
      };
    };

    void run();

    return () => {
      cancelled = true;
      if (teardown) {
        teardown();
      } else {
        // run() was cancelled before the terminal was created — clear refs
        termRef.current = null;
        fitAddonRef.current = null;
        searchAddonRef.current = null;
      }
    };
  }, [sessionId]); // settings read via getState() intentionally — avoids recreating live sessions

  // Live-reload font size and family into open tabs whenever either setting changes.
  const fontSize = useTerminalSettings((s) => s.fontSize);
  const fontFamily = useTerminalSettings((s) => s.fontFamily);
  useEffect(() => {
    const term = termRef.current;
    const fitAddon = fitAddonRef.current;
    if (!term || !fitAddon) return;

    const css = fontCss(fontFamily);

    void ensureFont(fontFamily).then(() => {
      if (!termRef.current || !fitAddonRef.current) return;
      term.options.fontSize = fontSize;
      term.options.fontFamily = css;
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit();
        term.refresh(0, term.rows - 1);
      });
    });
  }, [fontSize, fontFamily]);

  const filteredSnippets = useMemo(() => {
    if (!snippetQuery.trim()) return snippets;
    const q = snippetQuery.toLowerCase();
    return snippets.filter(
      (sn) => sn.title.toLowerCase().includes(q) || sn.body.toLowerCase().includes(q),
    );
  }, [snippets, snippetQuery]);

  const openSnippetPicker = useCallback(() => {
    if (snippets.length === 0) void fetchSnippets();
    setSnippetPickerOpen(true);
    setSnippetQuery("");
  }, [snippets.length, fetchSnippets]);

  const runSnippet = useCallback((body: string) => {
    terminalCommands.sendTerminalInput(sessionId, body + "\n").catch(() => {});
    setSnippetPickerOpen(false);
    setSnippetQuery("");
  }, [sessionId]);

  useEffect(() => {
    if (!snippetPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        !snippetPickerRef.current?.contains(e.target as Node) &&
        !snippetButtonRef.current?.contains(e.target as Node)
      ) {
        setSnippetPickerOpen(false);
        setSnippetQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [snippetPickerOpen]);

  return (
    <div className="relative h-full w-full bg-surface-1">
      <div ref={containerRef} className="absolute inset-4 overflow-hidden" />

      {/* Snippet picker — floats over terminal at bottom-right */}
      <div className="absolute bottom-3 right-4 z-30 flex flex-col items-end gap-1">
        {snippetPickerOpen && (
          <div
            ref={snippetPickerRef}
            className="mb-1 w-64 bg-surface-2 border border-stroke rounded-lg shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="p-2 border-b border-stroke-subtle shrink-0">
              <input
                autoFocus
                type="text"
                value={snippetQuery}
                onChange={(e) => setSnippetQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setSnippetPickerOpen(false); setSnippetQuery(""); }
                  if (e.key === "Enter" && filteredSnippets.length === 1) runSnippet(filteredSnippets[0].body);
                }}
                placeholder="Search snippets…"
                className="w-full bg-surface-3 border border-stroke rounded px-2.5 py-1.5 text-sm text-white placeholder-faint outline-none focus:border-accent transition-colors"
              />
            </div>
            <div className="overflow-y-auto max-h-56">
              {filteredSnippets.length > 0 ? (
                filteredSnippets.map((sn) => (
                  <button
                    key={sn.id}
                    onClick={() => runSnippet(sn.body)}
                    className="w-full text-left px-3 py-2 hover:bg-surface-3 transition-colors group"
                  >
                    <p className="text-sm text-white truncate">{sn.title}</p>
                    <p className="text-xs text-dim font-mono truncate mt-0.5 group-hover:text-muted">{sn.body}</p>
                  </button>
                ))
              ) : (
                <p className="px-3 py-4 text-center text-sm text-dim">
                  {snippets.length === 0 ? "No snippets saved" : "No matches"}
                </p>
              )}
            </div>
          </div>
        )}
        <button
          ref={snippetButtonRef}
          onClick={openSnippetPicker}
          title="Run a snippet"
          aria-label="Open snippet picker"
          className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
            snippetPickerOpen
              ? "bg-accent/20 text-accent-fg"
              : "bg-surface-3/70 text-dim hover:text-muted hover:bg-surface-3"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="12" height="12" rx="2" />
            <line x1="5" y1="5.5" x2="11" y2="5.5" />
            <line x1="5" y1="8" x2="11" y2="8" />
            <line x1="5" y1="10.5" x2="8" y2="10.5" />
          </svg>
        </button>
      </div>

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
              searchQueryRef.current = q;
              lastFoundRef.current = null;
              if (q) {
                searchAddonRef.current?.findNext(q, { incremental: true });
                const pos = termRef.current?.getSelectionPosition();
                if (pos) lastFoundRef.current = { col: pos.start.x - 1, row: pos.start.y - 1 };
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); e.shiftKey ? findPrevious() : findNext(); }
              else if (e.key === "ArrowUp") { e.preventDefault(); findPrevious(); }
              else if (e.key === "Escape") { closeSearch(); }
            }}
            placeholder="Find in terminal…"
            className="bg-transparent text-sm text-white placeholder-[#555] outline-none w-44"
          />
          {searchResults && (
            <span className="text-xs text-dim tabular-nums shrink-0">
              {searchResults.index !== undefined ? `${searchResults.index + 1}/` : ""}{searchResults.count}
            </span>
          )}
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
