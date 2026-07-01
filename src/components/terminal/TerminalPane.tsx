import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { openUrl } from "@tauri-apps/plugin-opener";
import { terminalCommands, clipboardCommands } from "../../lib/tauriCommands";
import { sessionBuffer } from "../../lib/sessionBuffer";
import { shadowInputBuffer } from "../../lib/shadowInputBuffer";
import { useTerminalStore } from "../../store/terminalStore";
import { useCommandHistoryStore } from "../../store/commandHistoryStore";
import { useBroadcastStore } from "../../store/broadcastStore";
import { useTerminalToolsStore } from "../../store/terminalToolsStore";
import { useTerminalSettings, fontCss, resolveTermTheme, lineHeightMultiplier, type TerminalThemeId } from "../../lib/terminalSettings";
import { ensureCanvasFonts, ensureFont } from "../../lib/canvasFonts";
import { ConnectingOverlay, ErrorOverlay, ReconnectingOverlay } from "../shared/ConnectionOverlay";
import { useSnippetStore } from "../../store/snippetStore";
import { usePlaybookStore } from "../../store/playbookStore";
import { usePlaybookRunStore } from "../../store/playbookRunStore";
import { useServerStore } from "../../store/serverStore";
import { resolvePlaybookStep } from "../../lib/playbookVariables";
import PlaybookRunBar from "./PlaybookRunBar";
import { AssistantPanel } from "./AssistantPanel";
import TunnelPickerPanel from "./TunnelPickerPanel";
import type { Playbook } from "../../types/playbook";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

// Matches xterm's auto-reply to a Device Status Report / cursor-position query
// (ESC[6n -> ESC[<row>;<col>R) — a per-session PTY reply, never user input.
// eslint-disable-next-line no-control-regex -- \x1b matches the ESC byte that starts terminal escape sequences
const TERMINAL_REPLY_PATTERN = /^\x1b\[\d+;\d+R$/;

// Matches an interactive password/passphrase prompt at the end of incoming PTY
// output (e.g. "Password:", "[sudo] password for alex:", "Enter passphrase for
// key '...':"). Used to stop fanning out keystrokes mid-broadcast — typing a
// secret into one server's prompt must never replay it into every other pane.
const PASSWORD_PROMPT_PATTERN = /(password|passphrase)[^:\n]*:\s*$/i;
// eslint-disable-next-line no-control-regex -- \x1b matches the ESC byte that starts ANSI escape sequences
const ANSI_ESCAPE_PATTERN = /\x1b\[[0-9;]*[a-zA-Z]/g;
const textDecoder = new TextDecoder();

// ── Main pane ─────────────────────────────────────────────────────────────────

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
  const confirmHostKey = useTerminalStore((s) => s.confirmHostKey);
  const confirmHooks = useTerminalStore((s) => s.confirmHooks);

  // Per-server terminal theme override — takes precedence over the global setting.
  const serverTermTheme = useServerStore((s) =>
    s.servers.find((sv) => sv.id === session?.serverId)?.terminalTheme as TerminalThemeId | undefined,
  );

  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ index: number | undefined; count: number } | null>(null);
  const [snippetQuery, setSnippetQuery] = useState("");
  const snippetPickerRef = useRef<HTMLDivElement>(null);

  const [playbookQuery, setPlaybookQuery] = useState("");
  const playbookPickerRef = useRef<HTMLDivElement>(null);

  const openTool = useTerminalToolsStore((s) => s.openTool);
  const closeTool = useTerminalToolsStore((s) => s.closeTool);
  const assistantPanelOpen = openTool === "assistant";
  const [assistantClosing, setAssistantClosing] = useState(false);
  const playbookPickerOpen = openTool === "playbooks";
  const snippetPickerOpen = openTool === "snippets";
  const tunnelPickerOpen = openTool === "tunnels";

  const closeAssistant = useCallback(() => {
    setAssistantClosing(true);
    setTimeout(() => {
      closeTool();
      setAssistantClosing(false);
    }, 180);
  }, [closeTool]);

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
      const { fontSize, lineHeight, scrollback, copyOnSelect, fontFamily, termTheme, cursorStyle } =
        useTerminalSettings.getState();
      const css = fontCss(fontFamily);
      // Per-server theme override: if the server has one set, use it; otherwise global.
      const serverId = useTerminalStore.getState().sessions.find((s) => s.id === sessionId)?.serverId;
      const perServerTheme = serverId
        ? (useServerStore.getState().servers.find((sv) => sv.id === serverId)?.terminalTheme as TerminalThemeId | undefined)
        : undefined;
      const effectiveTheme = perServerTheme ?? termTheme;

      // Ensure the default font and the selected font are loaded before creating
      // the terminal so xterm measures Canvas metrics against the real font from
      // the start — not the system fallback. Both loads are memoized by font id
      // and independent, so request them concurrently rather than sequentially.
      await Promise.all([ensureCanvasFonts(), ensureFont(fontFamily)]);

      if (cancelled || !containerRef.current) return;

      shadowInputBuffer.attach(sessionId);

      const term = new Terminal({
        cursorBlink: true,
        cursorStyle,
        fontFamily: css,
        fontSize,
        lineHeight: lineHeightMultiplier(lineHeight, fontSize),
        scrollback,
        theme: resolveTermTheme(effectiveTheme),
      });

      const fitAddon = new FitAddon();
      const searchAddon = new SearchAddon();
      const webLinksAddon = new WebLinksAddon((_e, uri) => openUrl(uri).catch(() => {}));
      term.loadAddon(fitAddon);
      term.loadAddon(searchAddon);
      term.loadAddon(webLinksAddon);
      searchAddon.onDidChangeResults((r) => {
        setSearchResults(r.resultCount > 0 ? { index: r.resultIndex, count: r.resultCount } : null);
      });

      term.open(containerRef.current);
      // xterm never sets viewport.style.backgroundColor — apply the theme
      // background to .xterm itself so it shows through the transparent viewport.
      if (term.element) term.element.style.backgroundColor = resolveTermTheme(effectiveTheme).background ?? "";
      fitAddon.fit();
      // Only focus the terminal if the user isn't currently typing in an input
      // or textarea. Without this guard, every tab switch or auto-reconnect
      // remounts this pane (due to key={terminalActiveId}) and steals focus.
      const activeEl = document.activeElement;
      if (
        !(activeEl instanceof HTMLInputElement) &&
        !(activeEl instanceof HTMLTextAreaElement) &&
        !(activeEl as HTMLElement | null)?.isContentEditable
      ) {
        term.focus();
      }

      // Cached cell metrics for the suggestion ghost — recomputed on resize
      // rather than on every cursor move, since clientWidth/clientHeight
      // reads force a synchronous layout reflow.
      let rowsEl: HTMLElement | null = null;
      let cellWidth = 0;
      let cellHeight = 0;
      const updateCellMetrics = () => {
        rowsEl = rowsEl ?? term.element?.querySelector<HTMLElement>(".xterm-rows") ?? null;
        if (!rowsEl || term.cols === 0 || term.rows === 0) return;
        cellWidth = rowsEl.clientWidth / term.cols;
        cellHeight = rowsEl.clientHeight / term.rows;
      };
      updateCellMetrics();

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
        const theme = resolveTermTheme(effectiveTheme);
        term.options.theme = theme;
        if (term.element) term.element.style.backgroundColor = theme.background ?? "";
        requestAnimationFrame(() => {
          if (cancelled) return;
          fitAddon.fit();
          updateCellMetrics();
        });
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

        // Right arrow with an active suggestion accepts it: forward just the
        // remainder so the shell receives it as if typed (its own history and
        // completion stay in control), and fold it into the shadow line so the
        // ghost text disappears in step. Sent directly — never broadcast —
        // because every pane's suggestion is local to its own shadow line, and
        // fanning this one out would inject the wrong text into the others.
        if (data === "\x1b[C" && useTerminalSettings.getState().ghostSuggestions) {
          const currentLine = shadowInputBuffer.getLine(sessionId);
          const activeSuggestion = serverId && currentLine
            ? useCommandHistoryStore.getState().suggest(serverId, currentLine)
            : null;
          if (activeSuggestion) {
            const remainder = activeSuggestion.slice(currentLine.length);
            shadowInputBuffer.feed(sessionId, remainder);
            terminalCommands.sendTerminalInput(sessionId, remainder).catch(() => {});
            return;
          }
        }

        // Replay into the shadow line for local command suggestions. Only
        // reachable here — never for terminal replies or secret-prompt input —
        // so passwords/passphrases can never end up in suggestion history.
        const completedCommand = shadowInputBuffer.feed(sessionId, data);
        if (completedCommand && serverId) {
          useCommandHistoryStore.getState().recordCommand(serverId, completedCommand);
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

      // Dim inline "ghost text" completing the current line from this server's
      // recent command history (accepted via -> above). Rendered as a DOM node
      // over .xterm-screen rather than written into the buffer — xterm has no
      // inline-suggestion concept, and writing into the buffer would collide
      // with the PTY's own echo.
      const suggestionGhost = document.createElement("div");
      suggestionGhost.className = "terminal-suggestion-ghost";
      suggestionGhost.style.display = "none";
      term.element?.querySelector<HTMLElement>(".xterm-screen")?.appendChild(suggestionGhost);

      const renderSuggestion = (line: string) => {
        if (!useTerminalSettings.getState().ghostSuggestions) {
          suggestionGhost.style.display = "none";
          return;
        }
        const suggestion = serverId && line ? useCommandHistoryStore.getState().suggest(serverId, line) : null;
        if (!suggestion) {
          suggestionGhost.style.display = "none";
          return;
        }

        if (cellWidth === 0 || cellHeight === 0) return;
        const { cursorX, cursorY } = term.buffer.active;

        suggestionGhost.textContent = suggestion.slice(line.length);
        suggestionGhost.style.left = `${cursorX * cellWidth}px`;
        suggestionGhost.style.top = `${cursorY * cellHeight}px`;
        suggestionGhost.style.height = `${cellHeight}px`;
        suggestionGhost.style.lineHeight = `${cellHeight}px`;
        suggestionGhost.style.display = "block";
      };
      const unsubscribeSuggestion = shadowInputBuffer.subscribe(sessionId, renderSuggestion);
      let prevGhostSuggestions = useTerminalSettings.getState().ghostSuggestions;
      const unsubscribeGhostSetting = useTerminalSettings.subscribe((state) => {
        if (state.ghostSuggestions === prevGhostSuggestions) return;
        prevGhostSuggestions = state.ghostSuggestions;
        if (state.ghostSuggestions) renderSuggestion(shadowInputBuffer.getLine(sessionId));
        else suggestionGhost.style.display = "none";
      });
      // Incoming PTY output can scroll the cursor to a new row without any
      // keystroke (e.g. async log lines) — re-anchor the ghost so it doesn't
      // linger over what's now a stale row.
      const cursorMoveDisposer = term.onCursorMove(() => {
        renderSuggestion(shadowInputBuffer.getLine(sessionId));
      });

      // Rate-limit PTY resize to ≤1/100ms (xterm fires continuously during drag)
      const resizeObserver = new ResizeObserver(() => {
        if (resizeTimer.current) clearTimeout(resizeTimer.current);
        resizeTimer.current = setTimeout(() => {
          fitAddon.fit();
          updateCellMetrics();
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
        const globalTheme = useTerminalSettings.getState().termTheme;
        const sId = useTerminalStore.getState().sessions.find((s) => s.id === sessionId)?.serverId;
        const perServer = sId
          ? (useServerStore.getState().servers.find((sv) => sv.id === sId)?.terminalTheme as TerminalThemeId | undefined)
          : undefined;
        const theme = resolveTermTheme(perServer ?? globalTheme);
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
        shadowInputBuffer.detach(sessionId);
        unsubscribeSuggestion();
        unsubscribeGhostSetting();
        cursorMoveDisposer.dispose();
        suggestionGhost.remove();
        dataDisposer.dispose();
        selectionDisposer?.dispose();
        webLinksAddon.dispose();
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

  // Live-reload font size, line height, family, and colour theme into open tabs whenever any setting changes.
  const fontSize = useTerminalSettings((s) => s.fontSize);
  const lineHeight = useTerminalSettings((s) => s.lineHeight);
  const fontFamily = useTerminalSettings((s) => s.fontFamily);
  const termTheme = useTerminalSettings((s) => s.termTheme);
  const cursorStyle = useTerminalSettings((s) => s.cursorStyle);
  useEffect(() => {
    const term = termRef.current;
    const fitAddon = fitAddonRef.current;
    if (!term || !fitAddon) return;

    const css = fontCss(fontFamily);

    void ensureFont(fontFamily).then(() => {
      if (!termRef.current || !fitAddonRef.current) return;
      term.options.fontSize = fontSize;
      term.options.lineHeight = lineHeightMultiplier(lineHeight, fontSize);
      term.options.fontFamily = css;
      term.options.cursorStyle = cursorStyle;
      const resolvedTheme = resolveTermTheme(serverTermTheme ?? termTheme);
      term.options.theme = resolvedTheme;
      if (term.element) term.element.style.backgroundColor = resolvedTheme.background ?? "";
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit();
        term.refresh(0, term.rows - 1);
      });
    });
  }, [fontSize, lineHeight, fontFamily, termTheme, cursorStyle, serverTermTheme]);

  // Reads clean text (no escape sequences) from xterm's parsed buffer rather
  // than the raw byte scrollback in sessionBuffer — the buffer already holds
  // rendered lines, so no ANSI-stripping logic is needed here.
  const getRecentTerminalText = useCallback((maxLines = 40) => {
    const term = termRef.current;
    if (!term) return "";
    const buffer = term.buffer.active;
    const start = Math.max(0, buffer.length - maxLines);
    const lines: string[] = [];
    for (let i = start; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) lines.push(line.translateToString(true));
    }
    return lines.join("\n").trim();
  }, []);

  const filteredSnippets = useMemo(() => {
    if (!snippetQuery.trim()) return snippets;
    const q = snippetQuery.toLowerCase();
    return snippets.filter(
      (sn) => sn.title.toLowerCase().includes(q) || sn.body.toLowerCase().includes(q),
    );
  }, [snippets, snippetQuery]);

  useEffect(() => {
    if (snippetPickerOpen && snippets.length === 0) void fetchSnippets();
  }, [snippetPickerOpen, snippets.length, fetchSnippets]);

  const runSnippet = useCallback((body: string) => {
    terminalCommands.sendTerminalInput(sessionId, body + "\n")
      .catch((e) => console.error("[terminal] sendTerminalInput failed:", e));
    closeTool();
    setSnippetQuery("");
  }, [sessionId, closeTool]);

  useEffect(() => {
    if (!snippetPickerOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!snippetPickerRef.current?.contains(target) && !target.closest("[data-terminal-tool-trigger]")) {
        closeTool();
        setSnippetQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [snippetPickerOpen, closeTool]);

  const filteredPlaybooks = useMemo(() => {
    if (!playbookQuery.trim()) return playbooks;
    const q = playbookQuery.toLowerCase();
    return playbooks.filter(
      (pb) => pb.title.toLowerCase().includes(q) || pb.description?.toLowerCase().includes(q),
    );
  }, [playbooks, playbookQuery]);

  useEffect(() => {
    if (playbookPickerOpen && playbooks.length === 0) void fetchPlaybooks();
  }, [playbookPickerOpen, playbooks.length, fetchPlaybooks]);

  const startPlaybook = useCallback((playbook: Playbook) => {
    const server = useServerStore.getState().servers.find((sv) => sv.id === session?.serverId);
    if (!server) return;

    startPlaybookRun(
      playbook,
      (raw) => resolvePlaybookStep(raw, server),
      (resolved) => terminalCommands.sendTerminalInput(sessionId, resolved + "\n"),
    );
    closeTool();
    setPlaybookQuery("");
  }, [session?.serverId, sessionId, startPlaybookRun, closeTool]);

  useEffect(() => {
    if (!playbookPickerOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!playbookPickerRef.current?.contains(target) && !target.closest("[data-terminal-tool-trigger]")) {
        closeTool();
        setPlaybookQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [playbookPickerOpen, closeTool]);

  useEffect(() => {
    if (!assistantPanelOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) closeAssistant();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [assistantPanelOpen, closeAssistant]);

  return (
    <div className="relative h-full w-full bg-surface-1 flex flex-col">
      <PlaybookRunBar />
      <div className="relative flex-1 min-h-0">
      <div ref={containerRef} className="absolute inset-0 overflow-hidden" />

      {(assistantPanelOpen || assistantClosing) && (
        <AssistantPanel
          onClose={closeAssistant}
          exiting={assistantClosing}
          serverId={session?.serverId ?? ""}
          serverName={session?.serverName ?? ""}
          connectionStatus={session?.status ?? "connecting"}
          connectionError={session?.errorMessage}
          getRecentOutput={getRecentTerminalText}
          onRunCommand={(cmd) => terminalCommands.sendTerminalInput(sessionId, cmd + "\n")
            .catch((e) => console.error("[terminal] sendTerminalInput failed:", e))}
        />
      )}

      {/* Playbook picker — drops down from the playbook trigger in the tab bar */}
      {playbookPickerOpen && (
        <div
          ref={playbookPickerRef}
          className="absolute top-3 right-4 z-30 w-64 bg-surface-2 border border-stroke rounded-lg shadow-overlay overflow-hidden flex flex-col"
        >
          <div className="p-2 border-b border-stroke-subtle shrink-0">
            <Input
              autoFocus
              type="text"
              value={playbookQuery}
              onChange={(e) => setPlaybookQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { closeTool(); setPlaybookQuery(""); }
                if (e.key === "Enter" && filteredPlaybooks.length === 1) startPlaybook(filteredPlaybooks[0]);
              }}
              placeholder="Search playbooks…"
              className="h-auto px-2.5 py-1.5"
            />
          </div>
          <div className="overflow-y-auto max-h-[280px] p-2 flex flex-col gap-1.5">
            {filteredPlaybooks.length > 0 ? (
              filteredPlaybooks.map((pb) => (
                <Button
                  key={pb.id}
                  variant="ghost"
                  onClick={() => startPlaybook(pb)}
                  className="h-auto w-full flex-col items-start text-left bg-surface-1 border border-stroke-subtle rounded-lg px-3 py-2.5 hover:border-stroke group"
                >
                  <p className="text-sm font-medium text-white truncate">{pb.title}</p>
                  <p className="text-meta text-dim font-mono truncate mt-1 group-hover:text-muted">
                    {pb.steps.length} step{pb.steps.length === 1 ? "" : "s"}
                    {pb.description ? ` — ${pb.description}` : ""}
                  </p>
                </Button>
              ))
            ) : (
              <p className="py-4 text-center text-sm text-dim">
                {playbooks.length === 0 ? "No playbooks saved" : "No matches"}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Snippet picker — drops down from the snippet trigger in the tab bar */}
      {snippetPickerOpen && (
        <div
          ref={snippetPickerRef}
          className="absolute top-3 right-4 z-30 w-64 bg-surface-2 border border-stroke rounded-lg shadow-overlay overflow-hidden flex flex-col"
        >
          <div className="p-2 border-b border-stroke-subtle shrink-0">
            <Input
              autoFocus
              type="text"
              value={snippetQuery}
              onChange={(e) => setSnippetQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { closeTool(); setSnippetQuery(""); }
                if (e.key === "Enter" && filteredSnippets.length === 1) runSnippet(filteredSnippets[0].body);
              }}
              placeholder="Search snippets…"
              className="h-auto px-2.5 py-1.5"
            />
          </div>
          <div className="overflow-y-auto max-h-[280px] p-2 flex flex-col gap-1.5">
            {filteredSnippets.length > 0 ? (
              filteredSnippets.map((sn) => (
                <Button
                  key={sn.id}
                  variant="ghost"
                  onClick={() => runSnippet(sn.body)}
                  className="h-auto w-full flex-col items-start text-left bg-surface-1 border border-stroke-subtle rounded-lg px-3 py-2.5 hover:border-stroke group"
                >
                  <p className="text-sm font-medium text-white truncate">{sn.title}</p>
                  <p className="text-meta text-dim font-mono truncate mt-1 group-hover:text-muted">{sn.body}</p>
                </Button>
              ))
            ) : (
              <p className="py-4 text-center text-sm text-dim">
                {snippets.length === 0 ? "No snippets saved" : "No matches"}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tunnel picker — port forward manager for the active session; not
          applicable to local-shell sessions, which have no remote server */}
      {tunnelPickerOpen && session?.kind === "ssh" && session.serverId && (
        <TunnelPickerPanel serverId={session.serverId} />
      )}

      {/* Search bar — floats over terminal at top-right */}
      {searchVisible && (
        <div className="absolute top-3 right-4 z-30 flex items-center gap-1.5 bg-surface-3 rounded-lg px-2.5 py-1.5">
          <Input
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
              if (e.key === "Enter" || e.key === "ArrowDown") {
                e.preventDefault();
                if (e.shiftKey) findPrevious();
                else findNext();
              }
              else if (e.key === "ArrowUp") { e.preventDefault(); findPrevious(); }
              else if (e.key === "Escape") { closeSearch(); }
            }}
            placeholder="Find in terminal…"
            className="h-auto border-0 bg-transparent placeholder-[#555] w-44 pl-2"
          />
          {searchResults && (
            <span className="text-meta text-dim tabular-nums shrink-0">
              {searchResults.index !== undefined ? `${searchResults.index + 1}/` : ""}{searchResults.count}
            </span>
          )}
          <Button variant="ghost" onClick={findPrevious} title="Previous (Shift+Enter)"
            className="h-auto text-muted px-1 text-sm leading-none">↑</Button>
          <Button variant="ghost" onClick={findNext} title="Next (Enter)"
            className="h-auto text-muted px-1 text-sm leading-none">↓</Button>
          <Button variant="ghost" onClick={closeSearch} aria-label="Close search"
            className="h-auto text-faint px-1 text-base leading-none ml-0.5">×</Button>
        </div>
      )}

      {session?.hookConfirmPrompt && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-2 border border-stroke rounded-xl p-6 max-w-md w-full mx-4 shadow-overlay">
            <h3 className="text-base font-semibold text-white mb-2">Confirm connection hook</h3>
            <p className="text-sm text-text-muted mb-4">
              This server runs the command below {session.hookConfirmPrompt.postDisconnectHook && !session.hookConfirmPrompt.preConnectHook ? "after you disconnect" : "before connecting"} — new or changed since you last approved it. Review it before continuing.
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { void confirmHooks(sessionId, false); }}
              >
                Cancel connection
              </Button>
              <Button
                size="sm"
                onClick={() => { void confirmHooks(sessionId, true); }}
              >
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
              <span className="text-white font-mono">{session.hostKeyPrompt.host}:{session.hostKeyPrompt.port}</span>.
              Verify the fingerprint out of band before accepting.
            </p>
            <div className="bg-surface-1 rounded-lg p-3 mb-4 font-mono text-xs text-text-muted break-all">
              <span className="text-text-subtle block mb-1">{session.hostKeyPrompt.keyType}</span>
              {session.hostKeyPrompt.fingerprint}
            </div>
            <div className="flex gap-3 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { void confirmHostKey(sessionId, false); }}
              >
                Reject
              </Button>
              <Button
                size="sm"
                onClick={() => { void confirmHostKey(sessionId, true); }}
              >
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
      </div>
    </div>
  );
}
