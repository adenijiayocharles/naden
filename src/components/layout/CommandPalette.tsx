import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useUiStore } from "../../store/uiStore";
import { useTerminalStore, type TerminalSession } from "../../store/terminalStore";
import { useSnippetStore } from "../../store/snippetStore";
import { usePlaybookStore } from "../../store/playbookStore";
import { useTunnelStore } from "../../store/tunnelStore";
import { searchCommands } from "../../lib/tauriCommands";
import type { Server } from "../../types/server";
import type { Snippet } from "../../types/snippet";
import type { Playbook } from "../../types/playbook";
import type { PortForward } from "../../types/portForward";

// ── Item types ─────────────────────────────────────────────────────────────────

type ActionItem = {
  kind: "action";
  id: string;
  label: string;
  shortcut?: string;
};
type ServerItem  = { kind: "server";   server:   Server };
type SessionItem = { kind: "session";  session:  TerminalSession };
type SnippetItem = { kind: "snippet";  snippet:  Snippet };
type PlaybookItem = { kind: "playbook"; playbook: Playbook };
type TunnelItem  = { kind: "tunnel";   tunnel:   PortForward };
type PaletteItem = ActionItem | ServerItem | SessionItem | SnippetItem | PlaybookItem | TunnelItem;

interface Section {
  title: string;
  items: PaletteItem[];
}

// ── Static action list ─────────────────────────────────────────────────────────

const STATIC_ACTIONS: ActionItem[] = [
  { kind: "action", id: "add-server",   label: "Add server",        shortcut: "⌘N" },
  { kind: "action", id: "local-terminal", label: "Open Local Terminal" },
  { kind: "action", id: "settings",     label: "Settings",          shortcut: "⌘," },
  { kind: "action", id: "import-ssh",   label: "Import SSH Config" },
  { kind: "action", id: "discover",     label: "Discover Hosts" },
  { kind: "action", id: "logs",         label: "Logs" },
  { kind: "action", id: "snippets",     label: "Snippets" },
  { kind: "action", id: "playbooks",    label: "Playbooks" },
  { kind: "action", id: "tunnels",      label: "Tunnels" },
  { kind: "action", id: "keys",         label: "Keys / Vault" },
];

// ── Icons ──────────────────────────────────────────────────────────────────────

const ITEM_ICON_CLS = "w-3.5 h-3.5 text-muted shrink-0";

function ServerIcon() {
  return (
    <svg className={ITEM_ICON_CLS} fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="14" height="9" rx="1.5" />
      <line x1="5" y1="12" x2="5" y2="14" />
      <line x1="11" y1="12" x2="11" y2="14" />
      <line x1="3" y1="14" x2="13" y2="14" />
      <circle cx="8" cy="7.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg className={ITEM_ICON_CLS} fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2" width="14" height="12" rx="1.5" />
      <path d="M4 6.5l3 2-3 2" />
      <line x1="9" y1="10.5" x2="12" y2="10.5" />
    </svg>
  );
}

function ActionIcon() {
  return (
    <svg className={ITEM_ICON_CLS} fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3,4 7,8 3,12" />
      <line x1="9" y1="12" x2="13" y2="12" />
    </svg>
  );
}

function SnippetIcon() {
  return (
    <svg className={ITEM_ICON_CLS} fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <line x1="5" y1="5.5" x2="11" y2="5.5" />
      <line x1="5" y1="8" x2="11" y2="8" />
      <line x1="5" y1="10.5" x2="8" y2="10.5" />
    </svg>
  );
}

function PlaybookIcon() {
  return (
    <svg className={ITEM_ICON_CLS} fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="9" height="12" rx="1.5" />
      <polyline points="9,1 14,6 9,6" />
      <line x1="5" y1="6" x2="7" y2="6" />
      <line x1="5" y1="8.5" x2="8" y2="8.5" />
      <line x1="5" y1="11" x2="7" y2="11" />
    </svg>
  );
}

function TunnelIcon() {
  return (
    <svg className={ITEM_ICON_CLS} fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="3" cy="8" r="1.5" />
      <circle cx="13" cy="8" r="1.5" />
      <line x1="4.5" y1="8" x2="11.5" y2="8" />
      <path d="M6 5.5 C6 3 10 3 10 5.5" />
      <path d="M6 10.5 C6 13 10 13 10 10.5" />
    </svg>
  );
}

// ── Status dot ─────────────────────────────────────────────────────────────────

const STATUS_DOT: Record<TerminalSession["status"], string> = {
  connected:    "bg-green-500",
  connecting:   "bg-yellow-500",
  disconnected: "bg-dim",
  error:        "bg-red-500",
};

// ── Unique key for palette items ───────────────────────────────────────────────

function itemKey(item: PaletteItem): string {
  if (item.kind === "server")   return `s:${item.server.id}`;
  if (item.kind === "session")  return `t:${item.session.id}`;
  if (item.kind === "snippet")  return `sn:${item.snippet.id}`;
  if (item.kind === "playbook") return `pb:${item.playbook.id}`;
  if (item.kind === "tunnel")   return `tn:${item.tunnel.id}`;
  return `a:${item.id}`;
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  onActivateSession: (sessionId: string) => void;
}

export default function CommandPalette({ onActivateSession }: Props) {
  const closePalette       = useUiStore((s) => s.closePalette);
  const openAdd            = useUiStore((s) => s.openAdd);
  const openSettings       = useUiStore((s) => s.openSettings);
  const openImportSshConfig = useUiStore((s) => s.openImportSshConfig);
  const openDiscoverHosts  = useUiStore((s) => s.openDiscoverHosts);
  const openLogs           = useUiStore((s) => s.openLogs);
  const openSnippets       = useUiStore((s) => s.openSnippets);
  const openPlaybooks      = useUiStore((s) => s.openPlaybooks);
  const openTunnels        = useUiStore((s) => s.openTunnels);
  const openKeys           = useUiStore((s) => s.openKeys);

  const sessions         = useTerminalStore((s) => s.sessions);
  const openSession      = useTerminalStore((s) => s.openSession);
  const openLocalSession = useTerminalStore((s) => s.openLocalSession);

  const snippets  = useSnippetStore((s) => s.snippets);
  const playbooks = usePlaybookStore((s) => s.playbooks);
  const forwards  = useTunnelStore((s) => s.forwards);

  const [query, setQuery]             = useState("");
  const [serverResults, setServerResults] = useState<Server[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Debounced fuzzy-search via the existing Rust backend
  useEffect(() => {
    if (!query.trim()) {
      setServerResults([]);
      setActiveIndex(0);
      return;
    }
    const timer = setTimeout(() => {
      searchCommands
        .fuzzySearch(query)
        .then(setServerResults)
        .catch(() => {});
    }, 50);
    return () => clearTimeout(timer);
  }, [query]);

  // ── Build sections ────────────────────────────────────────────────────────────

  const sections = useMemo<Section[]>(() => {
    const q = query.trim().toLowerCase();
    const individualSessions = sessions.filter((s) => !s.broadcastGroupId);

    if (!q) {
      const result: Section[] = [];
      if (individualSessions.length > 0) {
        result.push({
          title: "Open Sessions",
          items: individualSessions.map((s) => ({ kind: "session", session: s })),
        });
      }
      result.push({ title: "Actions", items: STATIC_ACTIONS });
      return result;
    }

    const result: Section[] = [];

    if (serverResults.length > 0) {
      result.push({
        title: "Servers",
        items: serverResults.map((s) => ({ kind: "server", server: s })),
      });
    }

    const matchedSessions = individualSessions.filter((s) =>
      (s.customName ?? s.serverName).toLowerCase().includes(q),
    );
    if (matchedSessions.length > 0) {
      result.push({
        title: "Open Sessions",
        items: matchedSessions.map((s) => ({ kind: "session", session: s })),
      });
    }

    const matchedSnippets = snippets.filter((sn) =>
      sn.title.toLowerCase().includes(q),
    );
    if (matchedSnippets.length > 0) {
      result.push({
        title: "Snippets",
        items: matchedSnippets.map((sn) => ({ kind: "snippet", snippet: sn })),
      });
    }

    const matchedPlaybooks = playbooks.filter((pb) =>
      pb.title.toLowerCase().includes(q),
    );
    if (matchedPlaybooks.length > 0) {
      result.push({
        title: "Playbooks",
        items: matchedPlaybooks.map((pb) => ({ kind: "playbook", playbook: pb })),
      });
    }

    const matchedTunnels = forwards.filter((fwd) =>
      fwd.label.toLowerCase().includes(q),
    );
    if (matchedTunnels.length > 0) {
      result.push({
        title: "Tunnels",
        items: matchedTunnels.map((fwd) => ({ kind: "tunnel", tunnel: fwd })),
      });
    }

    const matchedActions = STATIC_ACTIONS.filter((a) =>
      a.label.toLowerCase().includes(q),
    );
    if (matchedActions.length > 0) {
      result.push({ title: "Actions", items: matchedActions });
    }

    return result;
  }, [query, serverResults, sessions, snippets, playbooks, forwards]);

  // Precompute per-section offsets into the flat item list
  const sectionOffsets = useMemo(() => {
    const offsets: number[] = [];
    let off = 0;
    for (const sec of sections) {
      offsets.push(off);
      off += sec.items.length;
    }
    return offsets;
  }, [sections]);

  const totalItems = useMemo(
    () => sections.reduce((n, s) => n + s.items.length, 0),
    [sections],
  );

  // Reset cursor whenever sections change (covers query changes and async server results arriving)
  useEffect(() => { setActiveIndex(0); }, [sections]);

  // Scroll active item into view on arrow-key navigation
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>("[data-active-item='true']")
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // ── Action dispatch ───────────────────────────────────────────────────────────

  const dispatchAction = useCallback(
    (id: string) => {
      switch (id) {
        case "add-server":  openAdd();            break;
        case "local-terminal": void openLocalSession(); break;
        case "settings":    openSettings();       break;
        case "import-ssh":  openImportSshConfig(); break;
        case "discover":    openDiscoverHosts();   break;
        case "logs":        openLogs();            break;
        case "snippets":    openSnippets();        break;
        case "playbooks":   openPlaybooks();       break;
        case "tunnels":     openTunnels();         break;
        case "keys":        openKeys();            break;
      }
    },
    [openAdd, openLocalSession, openSettings, openImportSshConfig, openDiscoverHosts,
     openLogs, openSnippets, openPlaybooks, openTunnels, openKeys],
  );

  const activate = useCallback(
    (item: PaletteItem) => {
      closePalette();
      if (item.kind === "action") {
        dispatchAction(item.id);
      } else if (item.kind === "server") {
        void openSession(item.server.id, item.server.displayName);
      } else if (item.kind === "session") {
        onActivateSession(item.session.id);
      } else if (item.kind === "snippet") {
        openSnippets();
      } else if (item.kind === "playbook") {
        openPlaybooks();
      } else {
        openTunnels();
      }
    },
    [closePalette, dispatchAction, openSession, onActivateSession, openSnippets, openPlaybooks, openTunnels],
  );

  // ── Keyboard handler ──────────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, totalItems - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter": {
          e.preventDefault();
          const flat = sections.flatMap((s) => s.items);
          if (flat[activeIndex]) activate(flat[activeIndex]);
          break;
        }
        case "Escape":
          closePalette();
          break;
      }
    },
    [totalItems, sections, activeIndex, activate, closePalette],
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-start justify-center pt-[15vh] px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) closePalette(); }}
    >
      <div className="w-full max-w-xl bg-surface-1 border border-stroke-subtle rounded-xl shadow-overlay overflow-hidden animate-overlay-in">

        {/* Search bar */}
        <div className="flex items-center gap-3 px-4 border-b border-stroke-subtle">
          <svg className="w-4 h-4 text-muted shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
            <circle cx="6.5" cy="6.5" r="4.5" />
            <line x1="10" y1="10" x2="14" y2="14" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search servers, sessions, actions…"
            className="flex-1 bg-transparent py-4 text-sm text-white placeholder:text-dim outline-none"
          />
          <kbd className="text-[10px] text-dim border border-stroke-subtle rounded px-1.5 py-0.5 shrink-0 font-sans">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto max-h-[420px] pb-1.5">
          {totalItems === 0 ? (
            <p className="text-sm text-muted text-center py-12">
              {query.trim() ? "No results" : "Type to search…"}
            </p>
          ) : (
            sections.map((section, sectionIdx) => {
              const offset = sectionOffsets[sectionIdx];
              return (
                <div key={section.title}>
                  <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-faint select-none">
                    {section.title}
                  </div>
                  {section.items.map((item, itemIdx) => {
                    const idx = offset + itemIdx;
                    const isActive = activeIndex === idx;

                    return (
                      <button
                        key={itemKey(item)}
                        data-active-item={isActive ? "true" : undefined}
                        onMouseMove={() => setActiveIndex(idx)}
                        onClick={() => activate(item)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                          isActive
                            ? "bg-surface-3 text-white"
                            : "text-secondary hover:bg-surface-3 hover:text-white"
                        }`}
                      >
                        {/* Icon */}
                        {item.kind === "server"   && <ServerIcon />}
                        {item.kind === "session"  && <TerminalIcon />}
                        {item.kind === "action"   && <ActionIcon />}
                        {item.kind === "snippet"  && <SnippetIcon />}
                        {item.kind === "playbook" && <PlaybookIcon />}
                        {item.kind === "tunnel"   && <TunnelIcon />}

                        {/* Label */}
                        <span className="flex-1 min-w-0 flex items-center gap-2">
                          {item.kind === "server" && (
                            <>
                              <span className="font-medium text-white truncate">
                                {item.server.displayName}
                              </span>
                              <span className="text-xs text-muted shrink-0">
                                {item.server.hostname}
                              </span>
                            </>
                          )}
                          {item.kind === "session" && (
                            <>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[item.session.status]}`} />
                              <span className="truncate">
                                {item.session.customName ?? item.session.serverName}
                              </span>
                              <span className="text-xs text-muted shrink-0 capitalize">
                                {item.session.status}
                              </span>
                            </>
                          )}
                          {item.kind === "snippet" && (
                            <span className="truncate">{item.snippet.title}</span>
                          )}
                          {item.kind === "playbook" && (
                            <span className="truncate">{item.playbook.title}</span>
                          )}
                          {item.kind === "tunnel" && (
                            <>
                              <span className="font-medium text-white truncate">
                                {item.tunnel.label}
                              </span>
                              <span className="text-xs text-muted shrink-0">
                                :{item.tunnel.localPort} → {item.tunnel.remoteHost}:{item.tunnel.remotePort}
                              </span>
                            </>
                          )}
                          {item.kind === "action" && item.label}
                        </span>

                        {/* Right hint */}
                        {item.kind === "server" && (
                          <span className="text-xs text-dim shrink-0">Connect</span>
                        )}
                        {item.kind === "session" && (
                          <span className="text-xs text-dim shrink-0">Switch</span>
                        )}
                        {item.kind === "snippet" && (
                          <span className="text-xs text-dim shrink-0">Open</span>
                        )}
                        {item.kind === "playbook" && (
                          <span className="text-xs text-dim shrink-0">Open</span>
                        )}
                        {item.kind === "tunnel" && (
                          <span className="text-xs text-dim shrink-0">Open</span>
                        )}
                        {item.kind === "action" && item.shortcut && (
                          <kbd className={`text-xs shrink-0 font-sans ${isActive ? "text-muted" : "text-dim"}`}>
                            {item.shortcut}
                          </kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
