import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { terminalCommands } from "../../lib/tauriCommands";
import { useTerminalStore } from "../../store/terminalStore";
import { useTerminalToolsStore } from "../../store/terminalToolsStore";
import { type TerminalThemeId } from "../../lib/terminalSettings";
import { useSnippetStore } from "../../store/snippetStore";
import { usePlaybookStore } from "../../store/playbookStore";
import { usePlaybookRunStore } from "../../store/playbookRunStore";
import { useServerStore } from "../../store/serverStore";
import { resolvePlaybookStep } from "../../lib/playbookVariables";
import PlaybookRunBar from "./PlaybookRunBar";
import { AssistantPanel } from "./AssistantPanel";
import TunnelPickerPanel from "./TunnelPickerPanel";
import { TerminalOverlays } from "./TerminalOverlays";
import { useTerminalXterm, useRecentTerminalText } from "./useTerminalXterm";
import { useTerminalSearch } from "./useTerminalSearch";
import type { Playbook } from "../../types/playbook";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface Props {
  sessionId: string;
}

export default function TerminalPane({ sessionId }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const session = useTerminalStore((s) => s.sessions.find((t) => t.id === sessionId));
  const closeSession = useTerminalStore((s) => s.closeSession);
  const reconnectSession = useTerminalStore((s) => s.reconnectSession);
  const confirmHostKey = useTerminalStore((s) => s.confirmHostKey);
  const confirmHooks = useTerminalStore((s) => s.confirmHooks);

  // Per-server terminal theme override — takes precedence over the global setting.
  const serverTermTheme = useServerStore((s) =>
    s.servers.find((sv) => sv.id === session?.serverId)?.terminalTheme as TerminalThemeId | undefined,
  );

  const search = useTerminalSearch({ termRef, searchAddonRef });

  useTerminalXterm({
    sessionId,
    containerRef,
    termRef,
    fitAddonRef,
    searchAddonRef,
    resizeTimer,
    searchVisibleRef: search.searchVisibleRef,
    setSearchVisible: search.setSearchVisible,
    setSearchQuery: search.setSearchQuery,
    setSearchResults: search.setSearchResults,
    serverTermTheme,
  });

  const getRecentTerminalText = useRecentTerminalText(termRef);

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

  const isConnecting = session?.status === "connecting";
  const isError = session?.status === "error";
  const isDisconnected = session?.status === "disconnected";

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

        {/* Tunnel picker — port forward manager for the active session */}
        {tunnelPickerOpen && session?.kind === "ssh" && session.serverId && (
          <TunnelPickerPanel serverId={session.serverId} />
        )}

        {/* Search bar — floats over terminal at top-right */}
        {search.searchVisible && (
          <div className="absolute top-3 right-4 z-30 flex items-center gap-1.5 bg-surface-3 rounded-lg px-2.5 py-1.5">
            <Input
              autoFocus
              type="text"
              value={search.searchQuery}
              onChange={(e) => {
                const q = e.target.value;
                search.setSearchQuery(q);
                search.searchQueryRef.current = q;
                search.lastFoundRef.current = null;
                if (q) {
                  searchAddonRef.current?.findNext(q, { incremental: true });
                  const pos = termRef.current?.getSelectionPosition();
                  if (pos) search.lastFoundRef.current = { col: pos.start.x - 1, row: pos.start.y - 1 };
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "ArrowDown") {
                  e.preventDefault();
                  if (e.shiftKey) search.findPrevious();
                  else search.findNext();
                }
                else if (e.key === "ArrowUp") { e.preventDefault(); search.findPrevious(); }
                else if (e.key === "Escape") { search.closeSearch(); }
              }}
              placeholder="Find in terminal…"
              className="h-auto border-0 bg-transparent placeholder-[#555] w-44 pl-2"
            />
            {search.searchResults && (
              <span className="text-meta text-dim tabular-nums shrink-0">
                {search.searchResults.index !== undefined ? `${search.searchResults.index + 1}/` : ""}{search.searchResults.count}
              </span>
            )}
            <Button variant="ghost" onClick={search.findPrevious} title="Previous (Shift+Enter)"
              className="h-auto text-muted px-1 text-sm leading-none">↑</Button>
            <Button variant="ghost" onClick={search.findNext} title="Next (Enter)"
              className="h-auto text-muted px-1 text-sm leading-none">↓</Button>
            <Button variant="ghost" onClick={search.closeSearch} aria-label="Close search"
              className="h-auto text-faint px-1 text-base leading-none ml-0.5">×</Button>
          </div>
        )}

        <TerminalOverlays
          sessionId={sessionId}
          session={session}
          isConnecting={isConnecting}
          isDisconnected={isDisconnected}
          isError={isError}
          confirmHostKey={confirmHostKey}
          confirmHooks={confirmHooks}
          closeSession={closeSession}
          reconnectSession={reconnectSession}
        />
      </div>
    </div>
  );
}
