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
  setActive: (sessionId: string) => void;
  removeSession: (sessionId: string) => void;
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,

  openSession: async (serverId, serverName) => {
    if (get().sessions.length >= MAX_TABS) return null;

    const sessionId = await terminalCommands.openTerminalSession(serverId);

    // Attach output buffer before adding to state so no bytes are missed
    await sessionBuffer.attach(sessionId);

    // Register status/closed/error listeners in the store so they fire even
    // when no TerminalPane is mounted for this session
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
        get().removeSession(sessionId);
      }),

      listen<string>(`terminal:error:${sessionId}`, ({ payload }) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, status: "error", errorMessage: payload } : s,
          ),
        }));
        setTimeout(() => get().removeSession(sessionId), 3000);
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

    return sessionId;
  },

  closeSession: async (sessionId) => {
    // Remove listeners and buffer first so the backend's terminal:closed event
    // that follows the close command doesn't trigger a second removeSession
    sessionUnlisteners.get(sessionId)?.forEach((fn) => fn());
    sessionUnlisteners.delete(sessionId);
    sessionBuffer.detach(sessionId);

    try {
      await terminalCommands.closeTerminalSession(sessionId);
    } catch {
      // Session may have already closed naturally
    }

    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== sessionId);
      return {
        sessions,
        activeSessionId:
          state.activeSessionId === sessionId
            ? (sessions[sessions.length - 1]?.id ?? null)
            : state.activeSessionId,
      };
    });
  },

  setActive: (sessionId) => set({ activeSessionId: sessionId }),

  removeSession: (sessionId) => {
    // Guard against double-removal (e.g. closeSession + terminal:closed race)
    if (!get().sessions.find((s) => s.id === sessionId)) return;

    sessionUnlisteners.get(sessionId)?.forEach((fn) => fn());
    sessionUnlisteners.delete(sessionId);
    sessionBuffer.detach(sessionId);

    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== sessionId);
      return {
        sessions,
        activeSessionId:
          state.activeSessionId === sessionId
            ? (sessions[sessions.length - 1]?.id ?? null)
            : state.activeSessionId,
      };
    });
  },
}));
