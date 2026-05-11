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
}

const MAX_TABS = 20;

// Held outside Zustand so cleanup functions are never serialised into state
const sessionUnlisteners = new Map<string, UnlistenFn[]>();

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
  sessionUnlisteners.get(sessionId)?.forEach((fn) => fn());
  sessionUnlisteners.delete(sessionId);
  sessionBuffer.detach(sessionId);
}

function dropFromState(state: TerminalStore, sessionId: string) {
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
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === sessionId ? { ...s, status: "connected" } : s,
            ),
          }));
        }
      }),

      listen<null>(`terminal:closed:${sessionId}`, () => {
        // If the session is in error state keep it alive so the error overlay
        // stays visible — the user closes it explicitly via the Reconnect/Close
        // buttons in TerminalPane, which calls closeSession().
        const session = get().sessions.find((s) => s.id === sessionId);
        if (session?.status === "error") return;
        get().removeSession(sessionId);
      }),

      listen<string>(`terminal:error:${sessionId}`, ({ payload }) => {
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
