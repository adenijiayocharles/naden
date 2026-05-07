import { create } from "zustand";
import { terminalCommands } from "../lib/tauriCommands";

export type SessionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface TerminalSession {
  id: string;
  serverId: string;
  serverName: string;
  status: SessionStatus;
  errorMessage?: string;
}

const MAX_TABS = 20;

interface TerminalStore {
  sessions: TerminalSession[];
  activeSessionId: string | null;

  openSession: (serverId: string, serverName: string) => Promise<string | null>;
  closeSession: (sessionId: string) => Promise<void>;
  setActive: (sessionId: string) => void;
  setStatus: (sessionId: string, status: SessionStatus, errorMessage?: string) => void;
  removeSession: (sessionId: string) => void;
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,

  openSession: async (serverId, serverName) => {
    if (get().sessions.length >= MAX_TABS) return null;

    const sessionId = await terminalCommands.openTerminalSession(serverId);

    set((state) => ({
      sessions: [...state.sessions, { id: sessionId, serverId, serverName, status: "connecting" }],
      activeSessionId: sessionId,
    }));

    return sessionId;
  },

  closeSession: async (sessionId) => {
    try {
      await terminalCommands.closeTerminalSession(sessionId);
    } catch {
      // Session may have already closed naturally
    }
    get().removeSession(sessionId);
  },

  setActive: (sessionId) => set({ activeSessionId: sessionId }),

  setStatus: (sessionId, status, errorMessage) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, status, errorMessage } : s
      ),
    })),

  removeSession: (sessionId) =>
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== sessionId);
      const activeSessionId =
        state.activeSessionId === sessionId
          ? (sessions[sessions.length - 1]?.id ?? null)
          : state.activeSessionId;
      return { sessions, activeSessionId };
    }),
}));
