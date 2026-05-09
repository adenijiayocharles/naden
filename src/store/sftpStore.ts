import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { sftpCommands } from "../lib/tauriCommands";
import type { FileEntry } from "../types/sftp";

export type SftpStatus = "connecting" | "connected" | "error";

export interface SftpSession {
  id: string;
  serverId: string;
  serverName: string;
  status: SftpStatus;
  currentPath: string;
  entries: FileEntry[];
  loadingEntries: boolean;
  errorMessage?: string;
}

const sessionUnlisteners = new Map<string, UnlistenFn[]>();

interface SftpStore {
  sessions: SftpSession[];
  activeSessionId: string | null;

  openSession: (serverId: string, serverName: string) => Promise<string>;
  closeSession: (sessionId: string) => Promise<void>;
  setActive: (sessionId: string) => void;
  navigateTo: (sessionId: string, path: string) => Promise<void>;
  removeSession: (sessionId: string) => void;
}

function teardown(sessionId: string) {
  sessionUnlisteners.get(sessionId)?.forEach((fn) => fn());
  sessionUnlisteners.delete(sessionId);
}

function dropFromState(state: { sessions: SftpSession[]; activeSessionId: string | null }, sessionId: string) {
  const sessions = state.sessions.filter((s) => s.id !== sessionId);
  return {
    sessions,
    activeSessionId:
      state.activeSessionId === sessionId
        ? (sessions[sessions.length - 1]?.id ?? null)
        : state.activeSessionId,
  };
}

export const useSftpStore = create<SftpStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,

  openSession: async (serverId, serverName) => {
    const sessionId = await sftpCommands.openSftpSession(serverId);

    const unlisteners = await Promise.all([
      listen<string>(`sftp:status:${sessionId}`, ({ payload }) => {
        if (payload === "connected") {
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === sessionId ? { ...s, status: "connected" } : s,
            ),
          }));
          get().navigateTo(sessionId, "").catch(() => {});
        }
      }),

      listen<null>(`sftp:closed:${sessionId}`, () => {
        get().removeSession(sessionId);
      }),

      listen<string>(`sftp:error:${sessionId}`, ({ payload }) => {
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
        {
          id: sessionId,
          serverId,
          serverName,
          status: "connecting",
          currentPath: "~",
          entries: [],
          loadingEntries: false,
        },
      ],
      activeSessionId: sessionId,
    }));

    return sessionId;
  },

  closeSession: async (sessionId) => {
    teardown(sessionId);
    try {
      await sftpCommands.closeSftpSession(sessionId);
    } catch {
      // already closed
    }
    set((state) => dropFromState(state, sessionId));
  },

  setActive: (sessionId) => set({ activeSessionId: sessionId }),

  navigateTo: async (sessionId, path) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, loadingEntries: true } : s,
      ),
    }));
    try {
      const listing = await sftpCommands.listSftpDir(sessionId, path);
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId
            ? { ...s, currentPath: listing.path, entries: listing.entries, loadingEntries: false }
            : s,
        ),
      }));
    } catch (e) {
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, loadingEntries: false } : s,
        ),
      }));
      throw e;
    }
  },

  removeSession: (sessionId) => {
    if (!get().sessions.find((s) => s.id === sessionId)) return;
    teardown(sessionId);
    set((state) => dropFromState(state, sessionId));
  },
}));
