import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { terminalCommands, clipboardCommands } from "../../lib/tauriCommands";
import { sessionBuffer } from "../../lib/sessionBuffer";
import { useTerminalStore } from "../../store/terminalStore";
import { useBroadcastStore } from "../../store/broadcastStore";
import { useTerminalSettings, fontCss, resolveTermTheme } from "../../lib/terminalSettings";
import { ensureCanvasFonts, ensureFont } from "../../lib/canvasFonts";
import { ConnectingOverlay, ErrorOverlay, ReconnectingOverlay } from "../shared/ConnectionOverlay";
import { useSnippetStore } from "../../store/snippetStore";
import { usePlaybookStore } from "../../store/playbookStore";
import { usePlaybookRunStore } from "../../store/playbookRunStore";
import { useServerStore } from "../../store/serverStore";
import { resolvePlaybookStep } from "../../lib/playbookVariables";
import PlaybookRunBar from "./PlaybookRunBar";
import type { Playbook } from "../../types/playbook";

// Matches xterm's auto-reply to a Device Status Report / cursor-position query
// (ESC[6n -> ESC[<row>;<col>R) — a per-session PTY reply, never user input.
const TERMINAL_REPLY_PATTERN = /^\x1b\[\d+;\d+R$/;

// Matches an interactive password/passphrase prompt at the end of incoming PTY
// output (e.g. "Password:", "[sudo] password for alex:", "Enter passphrase for
// key '...':"). Used to stop fanning out keystrokes mid-broadcast — typing a
// secret into one server's prompt must never replay it into every other pane.
const PASSWORD_PROMPT_PATTERN = /(password|passphrase)[^:\n]*:\s*$/i;
const ANSI_ESCAPE_PATTERN = /\x1b\[[0-9;]*[a-zA-Z]/g;
const textDecoder = new TextDecoder();

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

  const [playbookPickerOpen, setPlaybookPickerOpen] = useState(false);
  const [playbookQuery, setPlaybookQuery] = useState("");
  const playbookPickerRef = useRef<HTMLDivElement>(null);
  const playbookButtonRef = useRef<HTMLButtonElement>(null);

  const snippets = useSnippetStore((s) => s.snippets);
  const fetchSnippets = useSnippetStore((s) => s.fetchAll);

  const playbooks = usePlaybookStore((s) => s.playbooks);
  const fetchPlaybooks = usePlaybookStore((s) => s.fetchAll);
  const startPlaybookRun = usePlaybookRunStore((s) => s.start);
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
  // Set when the remote just printed a password/passphrase prompt; cleared once
  // the user submits with Enter. While true, this pane's keystrokes go only to
  // its own session — never broadcast to the rest of the group.
  const awaitingSecretInputRef = useRef(false);

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
      const { fontSize, scrollback, copyOnSelect, fontFamily, termTheme } =
        useTerminalSettings.getState();
      const css = fontCss(fontFamily);

      // Ensure the default font is loaded, then the selected font, before
      // creating the terminal so xterm measures Canvas metrics against the real
      // font from the start — not the system fallback.
      await ensureCanvasFonts();
      await ensureFont(fontFamily);

      if (cancelled || !containerRef.current) return;

      const term = new Terminal({
        cursorBlink: true,
        fontFamily: css,
        fontSize,
        scrollback,
        theme: resolveTermTheme(termTheme),
      });

      const fitAddon = new FitAddon();
      const searchAddon = new SearchAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(searchAddon);
      searchAddon.onDidChangeResults((r) => {
        setSearchResults(r.resultCount > 0 ? { index: r.resultIndex, count: r.resultCount } : null);
      });

      term.open(containerRef.current);
      // xterm never sets viewport.style.backgroundColor — apply the theme
      // background to .xterm itself so it shows through the transparent viewport.
      if (term.element) term.element.style.backgroundColor = resolveTermTheme(termTheme).background ?? "";
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
        const theme = resolveTermTheme(termTheme);
        term.options.theme = theme;
        if (term.element) term.element.style.backgroundColor = theme.background ?? "";
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
      const { chunks, unsub } = sessionBuffer.subscribeAndReplay(sessionId, (data) => {
        term.write(data);
        const text = textDecoder.decode(data).replace(ANSI_ESCAPE_PATTERN, "");
        if (PASSWORD_PROMPT_PATTERN.test(text)) awaitingSecretInputRef.current = true;
      });
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
        // xterm answers terminal queries (e.g. cursor-position requests, ESC[6n)
        // automatically through this same onData callback. Those replies belong
        // only to this session's own PTY — broadcasting them corrupts other panes
        // with literal garbage like ";17R". Route anything matching a known
        // terminal-reply pattern straight to this session, never fanned out.
        if (TERMINAL_REPLY_PATTERN.test(data)) {
          terminalCommands.sendTerminalInput(sessionId, data).catch(() => {});
          return;
        }

        // A password/passphrase prompt is currently showing in this pane — keep
        // every keystroke (including the submitting Enter) local to this session
        // only, then resume normal fan-out once the secret has been submitted.
        if (awaitingSecretInputRef.current) {
          if (data.includes("\r") || data.includes("\n")) awaitingSecretInputRef.current = false;
          terminalCommands.sendTerminalInput(sessionId, data).catch(() => {});
          return;
        }

        // Read broadcast state fresh on each keystroke rather than subscribing —
        // this handler is registered once on mount and must see the latest group.
        const broadcast = useBroadcastStore.getState();
        const group = broadcast.groups.find((g) => g.id === broadcast.activeGroupId);
        const isSynced = group?.sessionIds.includes(sessionId) && !broadcast.excludedSessionIds.has(sessionId);

        if (isSynced) {
          // broadcastInput fans out to every synced pane in the group, including this one
          void broadcast.broadcastInput(data);
        } else {
          terminalCommands.sendTerminalInput(sessionId, data).catch(() => {});
        }
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

      // Re-arm cursor blink. WKWebView freezes the CSS animation when the app
      // is backgrounded or when focus moves away. Toggle cursorBlink off→on in
      // a new frame to force the browser to discard the frozen animation state.
      const restartBlink = () => {
        const t = termRef.current;
        if (!t?.options.cursorBlink) return;
        t.options.cursorBlink = false;
        requestAnimationFrame(() => {
          if (termRef.current) termRef.current.options.cursorBlink = true;
        });
      };
      window.addEventListener("focus", restartBlink);
      term.textarea?.addEventListener("focus", restartBlink);

      // Update terminal colours when the app theme or accent changes.
      // Only relevant when terminal theme is "system" (reads CSS vars).
      const themeObserver = new MutationObserver(() => {
        const theme = resolveTermTheme(useTerminalSettings.getState().termTheme);
        term.options.theme = theme;
        if (term.element) term.element.style.backgroundColor = theme.background ?? "";
        restartBlink();
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
        window.removeEventListener("focus", restartBlink);
        term.textarea?.removeEventListener("focus", restartBlink);
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

  // Live-reload font size, family, and colour theme into open tabs whenever any setting changes.
  const fontSize = useTerminalSettings((s) => s.fontSize);
  const fontFamily = useTerminalSettings((s) => s.fontFamily);
  const termTheme = useTerminalSettings((s) => s.termTheme);
  useEffect(() => {
    const term = termRef.current;
    const fitAddon = fitAddonRef.current;
    if (!term || !fitAddon) return;

    const css = fontCss(fontFamily);

    void ensureFont(fontFamily).then(() => {
      if (!termRef.current || !fitAddonRef.current) return;
      term.options.fontSize = fontSize;
      term.options.fontFamily = css;
      const resolvedTheme = resolveTermTheme(termTheme);
      term.options.theme = resolvedTheme;
      if (term.element) term.element.style.backgroundColor = resolvedTheme.background ?? "";
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit();
        term.refresh(0, term.rows - 1);
      });
    });
  }, [fontSize, fontFamily, termTheme]);

  const filteredSnippets = useMemo(() => {
    if (!snippetQuery.trim()) return snippets;
    const q = snippetQuery.toLowerCase();
    return snippets.filter(
      (sn) => sn.title.toLowerCase().includes(q) || sn.body.toLowerCase().includes(q),
    );
  }, [snippets, snippetQuery]);

  const openSnippetPicker = useCallback(() => {
    if (snippetPickerOpen) {
      setSnippetPickerOpen(false);
      setSnippetQuery("");
      return;
    }
    if (snippets.length === 0) void fetchSnippets();
    setSnippetPickerOpen(true);
    setSnippetQuery("");
  }, [snippetPickerOpen, snippets.length, fetchSnippets]);

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

  const filteredPlaybooks = useMemo(() => {
    if (!playbookQuery.trim()) return playbooks;
    const q = playbookQuery.toLowerCase();
    return playbooks.filter(
      (pb) => pb.title.toLowerCase().includes(q) || pb.description?.toLowerCase().includes(q),
    );
  }, [playbooks, playbookQuery]);

  const openPlaybookPicker = useCallback(() => {
    if (playbookPickerOpen) {
      setPlaybookPickerOpen(false);
      setPlaybookQuery("");
      return;
    }
    if (playbooks.length === 0) void fetchPlaybooks();
    setPlaybookPickerOpen(true);
    setPlaybookQuery("");
  }, [playbookPickerOpen, playbooks.length, fetchPlaybooks]);

  const startPlaybook = useCallback((playbook: Playbook) => {
    const server = useServerStore.getState().servers.find((sv) => sv.id === session?.serverId);
    if (!server) return;

    startPlaybookRun(
      playbook,
      (raw) => resolvePlaybookStep(raw, server),
      (resolved) => terminalCommands.sendTerminalInput(sessionId, resolved + "\n"),
    );
    setPlaybookPickerOpen(false);
    setPlaybookQuery("");
  }, [session?.serverId, sessionId, startPlaybookRun]);

  useEffect(() => {
    if (!playbookPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        !playbookPickerRef.current?.contains(e.target as Node) &&
        !playbookButtonRef.current?.contains(e.target as Node)
      ) {
        setPlaybookPickerOpen(false);
        setPlaybookQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [playbookPickerOpen]);

  return (
    <div className="relative h-full w-full bg-surface-1 flex flex-col">
      <PlaybookRunBar />
      <div className="relative flex-1 min-h-0">
      <div ref={containerRef} className="absolute inset-0 overflow-hidden" />

      {/* Playbook picker — floats over terminal at bottom-right, above the snippet picker */}
      <div className="absolute bottom-14 right-4 z-30 flex flex-col items-end gap-1">
        {playbookPickerOpen && (
          <div
            ref={playbookPickerRef}
            className="mb-1 w-64 bg-surface-2 border border-stroke rounded-lg shadow-overlay overflow-hidden flex flex-col"
          >
            <div className="p-2 border-b border-stroke-subtle shrink-0">
              <input
                autoFocus
                type="text"
                value={playbookQuery}
                onChange={(e) => setPlaybookQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setPlaybookPickerOpen(false); setPlaybookQuery(""); }
                  if (e.key === "Enter" && filteredPlaybooks.length === 1) startPlaybook(filteredPlaybooks[0]);
                }}
                placeholder="Search playbooks…"
                className="w-full bg-surface-3 border border-stroke rounded px-2.5 py-1.5 text-sm text-white placeholder-faint outline-none focus:border-accent transition-colors"
              />
            </div>
            <div className="overflow-y-auto h-[134px] p-2 flex flex-col gap-1.5">
              {filteredPlaybooks.length > 0 ? (
                filteredPlaybooks.map((pb) => (
                  <button
                    key={pb.id}
                    onClick={() => startPlaybook(pb)}
                    className="w-full text-left bg-surface-1 border border-stroke-subtle rounded-lg px-3 py-2.5 hover:border-stroke hover:bg-surface-2 transition-colors group"
                  >
                    <p className="text-sm font-medium text-white truncate">{pb.title}</p>
                    <p className="text-meta text-dim font-mono truncate mt-1 group-hover:text-muted">
                      {pb.steps.length} step{pb.steps.length === 1 ? "" : "s"}
                      {pb.description ? ` — ${pb.description}` : ""}
                    </p>
                  </button>
                ))
              ) : (
                <p className="py-4 text-center text-sm text-dim">
                  {playbooks.length === 0 ? "No playbooks saved" : "No matches"}
                </p>
              )}
            </div>
          </div>
        )}
        <button
          ref={playbookButtonRef}
          onClick={openPlaybookPicker}
          title="Run a playbook"
          aria-label="Open playbook picker"
          className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
            playbookPickerOpen
              ? "bg-accent/20 text-accent-fg"
              : "bg-surface-3/70 text-dim hover:text-muted hover:bg-surface-3"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <polygon points="6,4 12,8 6,12" />
          </svg>
        </button>
      </div>

      {/* Snippet picker — floats over terminal at bottom-right */}
      <div className="absolute bottom-3 right-4 z-30 flex flex-col items-end gap-1">
        {snippetPickerOpen && (
          <div
            ref={snippetPickerRef}
            className="mb-1 w-64 bg-surface-2 border border-stroke rounded-lg shadow-overlay overflow-hidden flex flex-col"
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
            <div className="overflow-y-auto h-[134px] p-2 flex flex-col gap-1.5">
              {filteredSnippets.length > 0 ? (
                filteredSnippets.map((sn) => (
                  <button
                    key={sn.id}
                    onClick={() => runSnippet(sn.body)}
                    className="w-full text-left bg-surface-1 border border-stroke-subtle rounded-lg px-3 py-2.5 hover:border-stroke hover:bg-surface-2 transition-colors group"
                  >
                    <p className="text-sm font-medium text-white truncate">{sn.title}</p>
                    <p className="text-meta text-dim font-mono truncate mt-1 group-hover:text-muted">{sn.body}</p>
                  </button>
                ))
              ) : (
                <p className="py-4 text-center text-sm text-dim">
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
        <div className="absolute top-3 right-4 z-30 flex items-center gap-1.5 bg-surface-3 rounded-lg px-2.5 py-1.5">
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
            className="bg-transparent text-sm text-white placeholder-[#555] outline-none w-44 pl-2"
          />
          {searchResults && (
            <span className="text-meta text-dim tabular-nums shrink-0">
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
    </div>
  );
}
