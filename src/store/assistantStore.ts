import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { assistantCommands } from "../lib/tauriCommands";
import { formatError } from "../lib/errors";

export type AssistantMessageStatus = "streaming" | "done" | "error";

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: AssistantMessageStatus;
  errorMessage?: string;
  /** Short label shown on a user turn that had terminal context attached, e.g. "Included: my-server, recent output". */
  contextLabel?: string;
}

/** Extra terminal context the user opted to attach to a single turn — sent to the provider but not shown verbatim in the transcript. */
export interface AssistantMessageContext {
  /** Prepended to the message content sent to the provider. */
  block: string;
  /** Short label rendered on the user's chat bubble in place of the full block. */
  label: string;
}

/** A past conversation, archived once the user starts a new chat or reopens a different one. */
export interface AssistantConversation {
  id: string;
  title: string;
  messages: AssistantMessage[];
  updatedAt: number;
  /** Provider that generated the replies in this conversation ("openai" | "anthropic"). */
  provider?: string;
}

// Held outside Zustand so cleanup functions are never serialised into state —
// same rationale as terminalStore's sessionUnlisteners.
const requestUnlisteners = new Map<string, UnlistenFn[]>();
// Per-server debounce timers for persist() — collapses rapid saves (e.g.
// startNewChat → openChat → sendMessage) into a single vault write.
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

function teardownRequest(requestId: string) {
  requestUnlisteners.get(requestId)?.forEach((fn) => fn());
  requestUnlisteners.delete(requestId);
}

/** Derives a short label for the history list from the first user turn. */
function deriveTitle(messages: AssistantMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New chat";
  const flat = firstUser.content.trim().replace(/\s+/g, " ");
  return flat.length > 48 ? `${flat.slice(0, 48)}…` : flat;
}

/** Packages the current conversation for the history list. */
function archiveCurrent(activeChatId: string, messages: AssistantMessage[], provider?: string): AssistantConversation {
  return { id: activeChatId, title: deriveTitle(messages), messages, updatedAt: Date.now(), provider };
}

/** A single server's chat — conversations never cross server boundaries. */
interface ServerAssistantState {
  messages: AssistantMessage[];
  isSending: boolean;
  activeChatId: string;
  history: AssistantConversation[];
  /** Provider that was used for the active conversation's replies — undefined on a fresh chat. */
  activeProvider?: string;
}

function createServerState(): ServerAssistantState {
  return { messages: [], isSending: false, activeChatId: crypto.randomUUID(), history: [] };
}

/** What gets written to (and read back from) the encrypted on-disk archive — `isSending` is transient and never persisted. */
interface PersistedServerChat {
  messages: AssistantMessage[];
  history: AssistantConversation[];
  activeChatId: string;
  activeProvider?: string;
}

interface AssistantState {
  // serverId -> that server's chat state
  byServer: Map<string, ServerAssistantState>;
  /** Mirrors the user's opt-in toggle (Settings → AI Assistant) — checked before any disk write. */
  persistEnabled: boolean;

  setPersistEnabled: (enabled: boolean) => void;
  /** Loads the archived transcript for `serverId` from disk, once, if nothing is in memory yet. */
  loadPersisted: (serverId: string) => Promise<void>;

  sendMessage: (serverId: string, content: string, context?: AssistantMessageContext, provider?: string) => Promise<void>;
  startNewChat: (serverId: string) => void;
  openChat: (serverId: string, id: string) => void;
}

export const useAssistantStore = create<AssistantState>((set, get) => {
  const withServer = (serverId: string, fn: (s: ServerAssistantState) => Partial<ServerAssistantState>) => {
    set((state) => {
      const existing = state.byServer.get(serverId) ?? createServerState();
      const byServer = new Map(state.byServer);
      byServer.set(serverId, { ...existing, ...fn(existing) });
      return { byServer };
    });
  };

  // Fire-and-forget with a 500 ms trailing debounce per server. Collapses rapid
  // successive calls (e.g. startNewChat followed immediately by sendMessage) into
  // a single vault write. Also prevents concurrent saves for the same server from
  // racing to create/delete vault rows.
  const persist = (serverId: string) => {
    if (!get().persistEnabled) return;
    const existing = persistTimers.get(serverId);
    if (existing) clearTimeout(existing);
    persistTimers.set(serverId, setTimeout(() => {
      persistTimers.delete(serverId);
      const s = get().byServer.get(serverId);
      if (!s) return;
      const payload: PersistedServerChat = {
        messages: s.messages,
        history: s.history,
        activeChatId: s.activeChatId,
        activeProvider: s.activeProvider,
      };
      void assistantCommands.saveChatHistory(serverId, JSON.stringify(payload))
        .catch((e) => { console.error("[assistant] failed to persist chat history:", e); });
    }, 500));
  };

  return {
    byServer: new Map(),
    persistEnabled: false,

    setPersistEnabled: (enabled) => set({ persistEnabled: enabled }),

    loadPersisted: async (serverId) => {
      // Already has in-memory state (this session's chat, or a prior load) — never clobber it.
      if (get().byServer.has(serverId)) return;

      let raw: string | null;
      try {
        raw = await assistantCommands.loadChatHistory(serverId);
      } catch {
        return;
      }
      if (!raw) return;

      let parsed: PersistedServerChat;
      try {
        const candidate = JSON.parse(raw);
        if (
          !candidate ||
          typeof candidate !== "object" ||
          !Array.isArray(candidate.messages)
        ) {
          return;
        }
        parsed = candidate as PersistedServerChat;
      } catch {
        return;
      }

      // Re-check after the await — the user may have started chatting while this loaded.
      if (get().byServer.has(serverId)) return;
      withServer(serverId, () => ({
        messages: parsed.messages,
        history: parsed.history,
        activeChatId: parsed.activeChatId,
        activeProvider: parsed.activeProvider,
      }));
    },

    sendMessage: async (serverId, content, context, provider) => {
      const trimmed = content.trim();
      const current = get().byServer.get(serverId) ?? createServerState();
      if (!trimmed || current.isSending) return;

      const userMessage: AssistantMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        status: "done",
        contextLabel: context?.label,
      };
      const replyId = crypto.randomUUID();
      const replyMessage: AssistantMessage = {
        id: replyId,
        role: "assistant",
        content: "",
        status: "streaming",
      };

      // Snapshot prior turns as-shown, then append the outgoing turn with any
      // attached context prepended — the provider sees the context block, but
      // the transcript keeps showing the user's own words plus a short label.
      const priorHistory = current.messages.map(({ role, content }) => ({ role, content }));
      const outgoingContent = context ? `${context.block}\n\n${trimmed}` : trimmed;
      const history = [...priorHistory, { role: "user" as const, content: outgoingContent }];

      withServer(serverId, (s) => ({
        messages: [...s.messages, userMessage, replyMessage],
        isSending: true,
        activeProvider: provider ?? s.activeProvider,
      }));

      const updateReply = (updater: (m: AssistantMessage) => AssistantMessage) => {
        withServer(serverId, (s) => ({
          messages: s.messages.map((m) => (m.id === replyId ? updater(m) : m)),
        }));
      };
      const finish = (updater: (m: AssistantMessage) => AssistantMessage, requestId: string) => {
        updateReply(updater);
        teardownRequest(requestId);
        withServer(serverId, () => ({ isSending: false }));
        persist(serverId);
      };

      const requestId = crypto.randomUUID();

      // Register listeners before dispatching — closes the same race the
      // terminal store avoids: an immediate failure could otherwise fire
      // assistant:error before a JS listener exists, leaving isSending stuck.
      const unlisteners = await Promise.all([
        listen<string>(`assistant:token:${requestId}`, ({ payload }) => {
          updateReply((m) => ({ ...m, content: m.content + payload }));
        }),
        listen<null>(`assistant:done:${requestId}`, () => {
          finish((m) => ({ ...m, status: "done" }), requestId);
        }),
        listen<string>(`assistant:error:${requestId}`, ({ payload }) => {
          finish((m) => ({ ...m, status: "error", errorMessage: payload }), requestId);
        }),
      ]);
      requestUnlisteners.set(requestId, unlisteners);

      try {
        await assistantCommands.sendMessage(requestId, history);
      } catch (e) {
        finish((m) => ({ ...m, status: "error", errorMessage: formatError(e) }), requestId);
      }
    },

    startNewChat: (serverId) => {
      const current = get().byServer.get(serverId);
      if (!current || current.isSending || current.messages.length === 0) return;

      withServer(serverId, (s) => ({
        messages: [],
        activeChatId: crypto.randomUUID(),
        activeProvider: undefined,
        history: [archiveCurrent(s.activeChatId, s.messages, s.activeProvider), ...s.history],
      }));
      persist(serverId);
    },

    openChat: (serverId, id) => {
      const current = get().byServer.get(serverId);
      if (!current || current.isSending || id === current.activeChatId) return;

      const target = current.history.find((c) => c.id === id);
      if (!target) return;

      const remaining = current.history.filter((c) => c.id !== id);
      withServer(serverId, (s) => ({
        messages: target.messages,
        activeChatId: target.id,
        activeProvider: target.provider,
        history: s.messages.length > 0 ? [archiveCurrent(s.activeChatId, s.messages, s.activeProvider), ...remaining] : remaining,
      }));
      persist(serverId);
    },
  };
});
