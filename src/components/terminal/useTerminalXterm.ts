import { useEffect, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { terminalCommands } from "../../lib/commands/terminal";
import { clipboardCommands, localCommands } from "../../lib/commands/local";
import { sessionBuffer } from "../../lib/sessionBuffer";
import { shadowInputBuffer } from "../../lib/shadowInputBuffer";
import { useTerminalStore } from "../../store/terminalStore";
import { useCommandHistoryStore } from "../../store/commandHistoryStore";
import { useBroadcastStore } from "../../store/broadcastStore";
import {
  useTerminalSettings,
  fontCss,
  resolveTermTheme,
  lineHeightMultiplier,
  type TerminalThemeId,
} from "../../lib/terminalSettings";
import { ensureCanvasFonts, ensureFont } from "../../lib/canvasFonts";
import { useServerStore } from "../../store/serverStore";

// Matches xterm's auto-reply to a Device Status Report / cursor-position query
// (ESC[6n -> ESC[<row>;<col>R) — a per-session PTY reply, never user input.
// eslint-disable-next-line no-control-regex -- \x1b matches the ESC byte that starts terminal escape sequences
const TERMINAL_REPLY_PATTERN = /^\x1b\[\d+;\d+R$/;

// Matches an interactive password/passphrase prompt at the end of incoming PTY
// output (e.g. "Password:", "[sudo] password for alex:", "Enter passphrase for
// key '...':"). Used to stop fanning out keystrokes mid-broadcast.
const PASSWORD_PROMPT_PATTERN = /(password|passphrase)[^:\n]*:\s*$/i;
// eslint-disable-next-line no-control-regex -- \x1b matches the ESC byte that starts ANSI escape sequences
const ANSI_ESCAPE_PATTERN = /\x1b\[[0-9;]*[a-zA-Z]/g;
const textDecoder = new TextDecoder();

interface Params {
  sessionId: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  termRef: React.MutableRefObject<Terminal | null>;
  fitAddonRef: React.MutableRefObject<FitAddon | null>;
  searchAddonRef: React.MutableRefObject<SearchAddon | null>;
  resizeTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  searchVisibleRef: React.RefObject<boolean>;
  setSearchVisible: (v: boolean) => void;
  setSearchQuery: (v: string) => void;
  setSearchResults: (r: { index: number | undefined; count: number } | null) => void;
  serverTermTheme: TerminalThemeId | undefined;
}

export function useTerminalXterm({
  sessionId,
  containerRef,
  termRef,
  fitAddonRef,
  searchAddonRef,
  resizeTimer,
  searchVisibleRef,
  setSearchVisible,
  setSearchQuery,
  setSearchResults,
  serverTermTheme,
}: Params): void {
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
      // the start — not the system fallback.
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
      const webLinksAddon = new WebLinksAddon((_e, uri) => localCommands.openUrl(uri).catch(() => {}));
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

      // Copy selected text automatically when copyOnSelect is enabled (xterm v6 removed built-in option).
      // Debounced to avoid an IPC write on every pixel of a mouse drag.
      let selectionTimer: ReturnType<typeof setTimeout> | null = null;
      const selectionDisposer = copyOnSelect
        ? term.onSelectionChange(() => {
            if (selectionTimer) clearTimeout(selectionTimer);
            selectionTimer = setTimeout(() => {
              const sel = term.getSelection();
              if (sel) clipboardCommands.writeText(sel).catch(() => {});
            }, 100);
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

      // Set when the remote just printed a password/passphrase prompt; cleared once
      // the user submits with Enter.
      const awaitingSecretInputRef = { current: false };

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
        // ghost text disappears in step.
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

        // Replay into the shadow line for local command suggestions.
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
          void broadcast.broadcastInput(data, completedCommand);
        } else {
          terminalCommands.sendTerminalInput(sessionId, data).catch(() => {});
        }
      });

      // Dim inline "ghost text" completing the current line from this server's
      // recent command history (accepted via -> above). Rendered as a DOM node
      // over .xterm-screen rather than written into the buffer.
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
      resizeObserver.observe(containerRef.current!);

      // Re-arm cursor blink. WKWebView freezes the CSS animation when the app
      // is backgrounded or when focus moves away.
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
        if (selectionTimer) clearTimeout(selectionTimer);
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
  }, [fontSize, lineHeight, fontFamily, termTheme, cursorStyle, serverTermTheme, termRef, fitAddonRef]);
}

export function useRecentTerminalText(termRef: React.RefObject<Terminal | null>) {
  return useCallback((maxLines = 40) => {
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
  }, [termRef]);
}
