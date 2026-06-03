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
  /** Hidden sessions are not shown as tabs — used for the SFTP split-pane peer. */
  hidden?: boolean;
}

const sessionUnlisteners = new Map<string, UnlistenFn[]>();
const sessionReconnectPolls = new Map<string, ReturnType<typeof setInterval>>();

interface SftpStore {
  sessions: SftpSession[];
  activeSessionId: string | null;

  openSession: (serverId: string, serverName: string) => Promise<string>;
  /** Opens a session that is not added to the tab bar. */
  openHiddenSession: (serverId: string, serverName: string) => Promise<string>;
  closeSession: (sessionId: string) => Promise<void>;
  reconnectSession: (sessionId: string) => Promise<void>;
  setActive: (sessionId: string) => void;
  navigateTo: (sessionId: string, path: string) => Promise<void>;
  removeSession: (sessionId: string) => void;
  reorderSessions: (sessions: SftpSession[]) => void;
}

function teardown(sessionId: string) {
  sessionUnlisteners.get(sessionId)?.forEach((fn) => fn());
  sessionUnlisteners.delete(sessionId);
  const poll = sessionReconnectPolls.get(sessionId);
  if (poll !== undefined) {
    clearInterval(poll);
    sessionReconnectPolls.delete(sessionId);
  }
}

function dropFromState(state: { sessions: SftpSession[]; activeSessionId: string | null }, sessionId: string) {
  const sessions = state.sessions.filter((s) => s.id !== sessionId);
  return {
    sessions,
    activeSessionId:
      state.activeSessionId === sessionId
        ? (sessions.filter((s) => !s.hidden).slice(-1)[0]?.id ?? null)
        : state.activeSessionId,
  };
}

export const useSftpStore = create<SftpStore>((set, get) => {
  // Shared implementation for both openSession and openHiddenSession.
  // hidden=true → session is not shown as a tab and does not steal activeSessionId.
  async function openSessionImpl(serverId: string, serverName: string, hidden: boolean): Promise<string> {
    // Register listeners BEFORE invoking Rust — closes the race where an
    // immediate failure fires sftp:error/closed before JS listeners exist.
    const sessionId = crypto.randomUUID();

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
        // Mirror the terminal store pattern: if the session is already in error state
        // the ErrorOverlay owns teardown (via the Reconnect button). Removing the
        // session here would destroy it before the user can interact with the overlay.
        const session = get().sessions.find((s) => s.id === sessionId);
        if (session?.status === "error") return;
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
          ...(hidden ? { hidden: true } : {}),
        },
      ],
      // Hidden sessions must not steal tab focus.
      ...(hidden ? {} : { activeSessionId: sessionId }),
    }));

    try {
      await sftpCommands.openSftpSession(serverId, sessionId);
    } catch (err) {
      teardown(sessionId);
      set((state) => dropFromState(state, sessionId));
      throw err;
    }

    return sessionId;
  }

  return {
    sessions: [],
    activeSessionId: null,

    openSession: (serverId, serverName) => openSessionImpl(serverId, serverName, false),
    openHiddenSession: (serverId, serverName) => openSessionImpl(serverId, serverName, true),

    closeSession: async (sessionId) => {
      teardown(sessionId);
      try {
        await sftpCommands.closeSftpSession(sessionId);
      } catch {
        // already closed
      }
      set((state) => dropFromState(state, sessionId));
    },

    reconnectSession: async (sessionId) => {
      const session = get().sessions.find((s) => s.id === sessionId);
      if (!session) return;
      const { serverId, serverName, currentPath, hidden } = session;
      teardown(sessionId);
      set((state) => dropFromState(state, sessionId));
      // Preserve the hidden flag so a reconnected peer session stays out of tabs.
      const newId = await openSessionImpl(serverId, serverName, hidden ?? false);
      // Re-navigate to the path the user was on once the session connects.
      if (currentPath && currentPath !== "~") {
        const poll = setInterval(() => {
          const s = get().sessions.find((x) => x.id === newId);
          if (s?.status === "connected") {
            clearInterval(poll);
            sessionReconnectPolls.delete(newId);
            get().navigateTo(newId, currentPath).catch(() => {
              get().navigateTo(newId, "").catch(() => {});
            });
          }
          if (!s || s.status === "error") {
            clearInterval(poll);
            sessionReconnectPolls.delete(newId);
          }
        }, 200);
        sessionReconnectPolls.set(newId, poll);
      }
    },

    setActive: (sessionId) => set({ activeSessionId: sessionId }),

    // Receives only visible (non-hidden) sessions from the tab bar drag handler.
    // Hidden sessions must be preserved in the store unchanged.
    reorderSessions: (visibleSessions) =>
      set((state) => ({
        sessions: [...visibleSessions, ...state.sessions.filter((s) => s.hidden)],
      })),

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
  };
});
