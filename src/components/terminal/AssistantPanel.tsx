import { useEffect, useRef, useState } from "react";

import { assistantCommands, type AssistantStatus } from "../../lib/tauriCommands";
import { timeAgo } from "../../lib/format";
import {
  useAssistantStore,
  type AssistantConversation,
  type AssistantMessage,
  type AssistantMessageContext,
} from "../../store/assistantStore";

// Stable empty references so selectors don't trigger re-renders for servers with no chat yet.
const EMPTY_MESSAGES: AssistantMessage[] = [];
const EMPTY_HISTORY: AssistantConversation[] = [];

interface AssistantPanelProps {
  onClose: () => void;
  serverId: string;
  serverName: string;
  connectionStatus: string;
  connectionError?: string;
  /** Returns recent terminal lines (already stripped of escape sequences) for the "include context" toggle. */
  getRecentOutput: (maxLines?: number) => string;
}

function buildContext(
  serverName: string,
  connectionStatus: string,
  connectionError: string | undefined,
  recentOutput: string,
): AssistantMessageContext {
  const lines = [`Server: ${serverName}`, `Connection status: ${connectionStatus}`];
  if (connectionError) lines.push(`Last error: ${connectionError}`);

  let block = lines.join("\n");
  if (recentOutput) block += `\n\nRecent terminal output:\n${recentOutput}`;

  const label = recentOutput
    ? `Included terminal context — ${serverName}, recent output`
    : `Included terminal context — ${serverName}`;

  return { block, label };
}

export function AssistantPanel({
  onClose,
  serverId,
  serverName,
  connectionStatus,
  connectionError,
  getRecentOutput,
}: AssistantPanelProps) {
  const messages = useAssistantStore((s) => s.byServer.get(serverId)?.messages ?? EMPTY_MESSAGES);
  const isSending = useAssistantStore((s) => s.byServer.get(serverId)?.isSending ?? false);
  const history = useAssistantStore((s) => s.byServer.get(serverId)?.history ?? EMPTY_HISTORY);
  const sendMessage = useAssistantStore((s) => s.sendMessage);
  const startNewChat = useAssistantStore((s) => s.startNewChat);
  const openChat = useAssistantStore((s) => s.openChat);

  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [input, setInput] = useState("");
  const [includeContext, setIncludeContext] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const historyPickerRef = useRef<HTMLDivElement>(null);

  // Re-checked on every open rather than cached — the user may toggle the
  // opt-in switch or save a key in Settings while this panel is closed.
  useEffect(() => {
    let cancelled = false;
    assistantCommands
      .getStatus()
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
        useAssistantStore.getState().setPersistEnabled(s.persistHistory);
        if (s.persistHistory) void useAssistantStore.getState().loadPersisted(serverId);
      })
      .catch(() => { if (!cancelled) setStatus({ configured: false, provider: null, enabled: false, persistHistory: false }); });
    return () => { cancelled = true; };
  }, [serverId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (!historyOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        !historyPickerRef.current?.contains(e.target as Node) &&
        !historyButtonRef.current?.contains(e.target as Node)
      ) {
        setHistoryOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [historyOpen]);

  const openPastChat = (id: string) => {
    openChat(serverId, id);
    setHistoryOpen(false);
  };

  const submit = () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    setInput("");
    const context = includeContext
      ? buildContext(serverName, connectionStatus, connectionError, getRecentOutput())
      : undefined;
    void sendMessage(serverId, trimmed, context);
  };

  const isReady = status?.configured && status.enabled;

  return (
    <div className="absolute top-0 right-0 bottom-0 w-80 z-40 bg-surface-2 border-l border-stroke shadow-overlay flex flex-col">
      <div className="relative flex items-center justify-between px-3 py-2.5 border-b border-stroke-subtle shrink-0">
        <span className="text-sm font-medium text-white">Assistant</span>
        <div className="flex items-center gap-1">
          <button
            ref={historyButtonRef}
            onClick={() => setHistoryOpen((v) => !v)}
            disabled={history.length === 0}
            title="Past chats"
            aria-label="Show past chats"
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors disabled:opacity-30 ${
              historyOpen ? "bg-accent/20 text-accent-fg" : "text-faint hover:text-white hover:bg-surface-3"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="6" />
              <path d="M8 5v3l2 1.5" />
            </svg>
          </button>
          <button
            onClick={() => startNewChat(serverId)}
            disabled={messages.length === 0}
            title="New chat"
            aria-label="Start a new chat"
            className="w-7 h-7 flex items-center justify-center rounded transition-colors text-faint hover:text-white hover:bg-surface-3 disabled:opacity-30"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3v10M3 8h10" />
            </svg>
          </button>
          <button
            onClick={onClose}
            aria-label="Close assistant panel"
            className="text-faint hover:text-white transition-colors text-base leading-none px-1"
          >
            ×
          </button>
        </div>

        {historyOpen && (
          <div
            ref={historyPickerRef}
            className="absolute top-full right-3 mt-1 w-64 bg-surface-2 border border-stroke rounded-lg shadow-overlay overflow-hidden flex flex-col z-50"
          >
            <div className="px-2.5 py-2 border-b border-stroke-subtle text-meta text-dim shrink-0">Past chats</div>
            <div className="overflow-y-auto max-h-64 p-2 flex flex-col gap-1.5">
              {history.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openPastChat(c.id)}
                  className="w-full text-left bg-surface-1 border border-stroke-subtle rounded-lg px-3 py-2 hover:border-stroke hover:bg-surface-2 transition-colors group"
                >
                  <p className="text-sm font-medium text-white truncate">{c.title}</p>
                  <p className="text-meta text-dim font-mono truncate mt-1 group-hover:text-muted">
                    {c.messages.length} message{c.messages.length === 1 ? "" : "s"} · {timeAgo(new Date(c.updatedAt).toISOString())}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {!isReady ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-1.5 px-6 text-center">
          <p className="text-sm text-dim">
            {status === null
              ? "Loading…"
              : !status.configured
              ? "Bring your own API key to chat with an AI assistant."
              : "The assistant is currently turned off."}
          </p>
          {status !== null && (
            <p className="text-meta text-faint">
              Open Settings → AI Assistant to {status.configured ? "turn it on" : "add a key"}.
            </p>
          )}
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2.5 flex flex-col gap-2.5">
            {messages.length === 0 ? (
              <p className="text-meta text-dim text-center mt-4">Ask about commands, errors, or what's on screen.</p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`flex flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}>
                  {m.contextLabel && (
                    <p className="text-meta text-faint italic">{m.contextLabel}</p>
                  )}
                  <div
                    className={`max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                      m.role === "user" ? "bg-accent/20 text-white" : "bg-surface-3 text-white"
                    }`}
                  >
                    {m.content || (m.status === "streaming" ? "…" : "")}
                  </div>
                  {m.status === "error" && (
                    <p className="text-meta text-red-400">{m.errorMessage ?? "Something went wrong."}</p>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="p-2.5 border-t border-stroke-subtle shrink-0">
            <label className="flex items-center gap-1.5 text-meta text-dim cursor-pointer select-none mb-1.5">
              <input
                type="checkbox"
                checked={includeContext}
                onChange={(e) => setIncludeContext(e.target.checked)}
                className="accent-accent"
              />
              Include terminal context (server, status, recent output)
            </label>
            <div className="flex items-end gap-1.5">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                rows={1}
                placeholder="Ask the assistant…"
                className="flex-1 resize-none bg-surface-3 border border-stroke rounded px-2.5 py-1.5 text-sm text-white placeholder-faint outline-none focus:border-accent transition-colors max-h-28"
              />
              <button
                onClick={submit}
                disabled={!input.trim() || isSending}
                title="Send"
                aria-label="Send message"
                className="w-8 h-8 shrink-0 flex items-center justify-center rounded transition-colors bg-accent/20 text-accent-fg hover:bg-accent/30 disabled:opacity-40"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 8h12M9 4l5 4-5 4" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
