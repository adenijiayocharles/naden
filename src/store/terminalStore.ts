import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { terminalCommands } from "../lib/tauriCommands";
import { sessionBuffer } from "../lib/sessionBuffer";

export type SessionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface TerminalSession {
  id: string;
  serverId: string;
  serverName: string;
  status: SessionStatus;
  errorMessage?: string;
  reconnectAt?: number; // epoch ms when the auto-reconnect will fire
}

const MAX_TABS = 20;

// Held outside Zustand so cleanup functions are never serialised into state
const sessionUnlisteners = new Map<string, UnlistenFn[]>();
// Pending auto-reconnect timers — cancelled if the user closes the tab first
const sessionReconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
// Sessions that reached "connected" at least once (so a later drop triggers auto-reconnect)
const connectedSessions = new Set<string>();
// Sessions that were opened as an auto-reconnect attempt — one shot only, close silently on failure
const autoReconnectSessions = new Set<string>();

interface TerminalStore {
  sessions: TerminalSession[];
  activeSessionId: string | null;

  openSession: (serverId: string, serverName: string) => Promise<string | null>;
  closeSession: (sessionId: string) => Promise<void>;
  reconnectSession: (sessionId: string) => Promise<void>;
  setActive: (sessionId: string) => void;
  removeSession: (sessionId: string) => void;
  reorderSessions: (sessions: TerminalSession[]) => void;
}

function teardownResources(sessionId: string) {
  if (sessionReconnectTimers.has(sessionId)) {
    clearTimeout(sessionReconnectTimers.get(sessionId)!);
    sessionReconnectTimers.delete(sessionId);
  }
  connectedSessions.delete(sessionId);
  autoReconnectSessions.delete(sessionId);
  sessionUnlisteners.get(sessionId)?.forEach((fn) => fn());
  sessionUnlisteners.delete(sessionId);
  sessionBuffer.detach(sessionId);
}

function dropFromState(
  state: { sessions: TerminalSession[]; activeSessionId: string | null },
  sessionId: string,
) {
  const sessions = state.sessions.filter((s) => s.id !== sessionId);
  return {
    sessions,
    activeSessionId:
      state.activeSessionId === sessionId
        ? (sessions[sessions.length - 1]?.id ?? null)
        : state.activeSessionId,
  };
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,

  openSession: async (serverId, serverName) => {
    if (get().sessions.length >= MAX_TABS) return null;

    // Generate the session ID here and register all listeners BEFORE invoking
    // Rust. This closes a race where an immediate failure (e.g. no network
    // after deep sleep) fires terminal:error/closed before JS listeners exist,
    // leaving the tab stuck on "connecting" forever.
    const sessionId = crypto.randomUUID();

    await sessionBuffer.attach(sessionId);

    const unlisteners = await Promise.all([
      listen<string>(`terminal:status:${sessionId}`, ({ payload }) => {
        if (payload === "connected") {
          // Mark as successfully connected. If it drops later, terminal:closed
          // will schedule auto-reconnect rather than just removing the tab.
          connectedSessions.add(sessionId);
          // No longer a pending reconnect attempt — future drops start fresh.
          autoReconnectSessions.delete(sessionId);
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === sessionId ? { ...s, status: "connected" } : s,
            ),
          }));
        }
      }),

      listen<null>(`terminal:closed:${sessionId}`, () => {
        const session = get().sessions.find((s) => s.id === sessionId);
        if (!session) return;

        // Auto-reconnect attempt ended — close silently (one shot, no retry).
        if (autoReconnectSessions.has(sessionId)) {
          get().removeSession(sessionId); // teardownResources called inside
          return;
        }

        // Session was connected at some point — unexpected drop.
        // Schedule one auto-reconnect attempt after 20 s regardless of whether
        // terminal:error also fired (error fires before closed on most drops).
        if (connectedSessions.has(sessionId)) {
          connectedSessions.delete(sessionId);
          const reconnectAt = Date.now() + 20_000;
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === sessionId
                ? { ...s, status: "disconnected", reconnectAt, errorMessage: undefined }
                : s,
            ),
          }));
          const timer = setTimeout(async () => {
            sessionReconnectTimers.delete(sessionId);
            const s = get().sessions.find((s) => s.id === sessionId);
            if (!s) return; // user cancelled during the wait
            const { serverId, serverName } = s;
            teardownResources(sessionId);
            set((state) => dropFromState(state, sessionId));
            const newId = await get().openSession(serverId, serverName);
            if (newId) autoReconnectSessions.add(newId);
          }, 20_000);
          sessionReconnectTimers.set(sessionId, timer);
          return;
        }

        // Never reached "connected" (initial connection failure):
        // keep the error overlay visible so the user can act on it.
        if (session.status === "error") return;

        // Anything else (e.g. cancelled while still connecting).
        get().removeSession(sessionId);
      }),

      listen<string>(`terminal:error:${sessionId}`, ({ payload }) => {
        // Suppress errors for sessions that were previously connected — the
        // terminal:closed handler will show the reconnect countdown instead.
        if (connectedSessions.has(sessionId)) return;
        // Suppress errors for auto-reconnect attempts — they close silently.
        if (autoReconnectSessions.has(sessionId)) return;
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, status: "error", errorMessage: payload } : s,
          ),
        }));
      }),
    ]);

    sessionUnlisteners.set(sessionId, unlisteners);

    set((state) => ({
      sessions: [
        ...state.sessions,
        { id: sessionId, serverId, serverName, status: "connecting" },
      ],
      activeSessionId: sessionId,
    }));

    try {
      await terminalCommands.openTerminalSession(serverId, sessionId);
    } catch (e) {
      // Synchronous Rust error (e.g. server not found, vault locked) — clean up.
      teardownResources(sessionId);
      set((state) => dropFromState(state, sessionId));
      return null;
    }

    return sessionId;
  },

  closeSession: async (sessionId) => {
    // Remove listeners and buffer first so the backend's terminal:closed event
    // that follows the close command doesn't trigger a second removeSession
    teardownResources(sessionId);

    try {
      await terminalCommands.closeTerminalSession(sessionId);
    } catch {
      // Session may have already closed naturally
    }

    set((state) => dropFromState(state, sessionId));
  },

  reconnectSession: async (sessionId) => {
    const session = get().sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const { serverId, serverName } = session;
    teardownResources(sessionId);
    set((state) => dropFromState(state, sessionId));
    await get().openSession(serverId, serverName);
  },

  setActive: (sessionId) => set({ activeSessionId: sessionId }),
  reorderSessions: (sessions) => set({ sessions }),

  removeSession: (sessionId) => {
    // Guard against double-removal (e.g. closeSession + terminal:closed race)
    if (!get().sessions.find((s) => s.id === sessionId)) return;

    teardownResources(sessionId);
    set((state) => dropFromState(state, sessionId));
  },
}));
