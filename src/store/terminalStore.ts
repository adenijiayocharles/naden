import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { terminalCommands } from "../lib/tauriCommands";
import { sessionBuffer } from "../lib/sessionBuffer";

export type SessionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface TerminalSession {
  id: string;
  serverId: string;
  serverName: string;
  customName?: string;
  status: SessionStatus;
  errorMessage?: string;
  reconnectAt?: number; // epoch ms when the auto-reconnect will fire
  broadcastGroupId?: string; // if set, session lives only inside a broadcast group tab
}

const MAX_TABS = 20;
// Backoff delays in ms for successive reconnect attempts (5 s → 10 s → 20 s → 40 s).
// Index 0 is the first attempt after an unexpected drop.
const RECONNECT_DELAYS = [5_000, 10_000, 20_000, 40_000] as const;

// Held outside Zustand so cleanup functions are never serialised into state
const sessionUnlisteners = new Map<string, UnlistenFn[]>();
// Pending auto-reconnect timers — cancelled if the user closes the tab first
const sessionReconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
// Sessions that reached "connected" at least once (so a later drop triggers auto-reconnect)
const connectedSessions = new Set<string>();
// Sessions that were opened as a reconnect attempt, mapped to their attempt index (0-based)
const autoReconnectSessions = new Map<string, number>();

interface TerminalStore {
  sessions: TerminalSession[];
  activeSessionId: string | null;

  openSession: (serverId: string, serverName: string, broadcastGroupId?: string) => Promise<string | null>;
  closeSession: (sessionId: string) => Promise<void>;
  reconnectSession: (sessionId: string) => Promise<void>;
  setActive: (sessionId: string) => void;
  removeSession: (sessionId: string) => void;
  reorderSessions: (sessions: TerminalSession[]) => void;
  renameSession: (sessionId: string, name: string) => void;
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

  openSession: async (serverId, serverName, broadcastGroupId) => {
    if (get().sessions.length >= MAX_TABS) return null;

    // Generate the session ID here and register all listeners BEFORE invoking
    // Rust. This closes a race where an immediate failure (e.g. no network
    // after deep sleep) fires terminal:error/closed before JS listeners exist,
    // leaving the tab stuck on "connecting" forever.
    const sessionId = crypto.randomUUID();

    // Register the output-buffer listener alongside the status/closed/error
    // listeners below — all four are independent `listen()` IPC round trips,
    // so run them concurrently rather than awaiting the buffer attach first.
    const [, ...unlisteners] = await Promise.all([
      sessionBuffer.attach(sessionId),
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

      listen<boolean>(`terminal:closed:${sessionId}`, ({ payload: isClean }) => {
        const session = get().sessions.find((s) => s.id === sessionId);
        if (!session) return;

        // Reconnect attempt ended — retry with backoff or show error when exhausted.
        if (autoReconnectSessions.has(sessionId)) {
          const attempt = autoReconnectSessions.get(sessionId)!;
          autoReconnectSessions.delete(sessionId);

          const nextAttempt = attempt + 1;
          if (nextAttempt >= RECONNECT_DELAYS.length) {
            set((state) => ({
              sessions: state.sessions.map((s) =>
                s.id === sessionId
                  ? { ...s, status: "error", errorMessage: "Connection lost. Could not reconnect after multiple attempts." }
                  : s,
              ),
            }));
            return;
          }

          const delay = RECONNECT_DELAYS[nextAttempt];
          const reconnectAt = Date.now() + delay;
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === sessionId
                ? { ...s, status: "disconnected", reconnectAt, errorMessage: undefined }
                : s,
            ),
          }));
          const retryTimer = setTimeout(async () => {
            sessionReconnectTimers.delete(sessionId);
            const s = get().sessions.find((s) => s.id === sessionId);
            if (!s) return;
            const { serverId, serverName, broadcastGroupId: bgid } = s;
            teardownResources(sessionId);
            set((state) => dropFromState(state, sessionId));
            const newId = await get().openSession(serverId, serverName, bgid);
            if (newId) autoReconnectSessions.set(newId, nextAttempt);
          }, delay);
          sessionReconnectTimers.set(sessionId, retryTimer);
          return;
        }

        // User typed `exit` — the shell exited cleanly. Close the tab immediately.
        if (isClean && connectedSessions.has(sessionId)) {
          get().removeSession(sessionId);
          return;
        }

        // Session was connected at some point — unexpected drop.
        // Schedule one auto-reconnect attempt after 20 s regardless of whether
        // terminal:error also fired (error fires before closed on most drops).
        if (connectedSessions.has(sessionId)) {
          connectedSessions.delete(sessionId);
          const delay = RECONNECT_DELAYS[0];
          const reconnectAt = Date.now() + delay;
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
            const { serverId, serverName, broadcastGroupId: bgid } = s;
            teardownResources(sessionId);
            set((state) => dropFromState(state, sessionId));
            const newId = await get().openSession(serverId, serverName, bgid);
            if (newId) autoReconnectSessions.set(newId, 0);
          }, delay);
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
        { id: sessionId, serverId, serverName, status: "connecting", broadcastGroupId },
      ],
      // Broadcast-group sessions live inside the group tab — don't switch the active tab
      activeSessionId: broadcastGroupId ? state.activeSessionId : sessionId,
    }));

    try {
      await terminalCommands.openTerminalSession(serverId, sessionId);
    } catch (e) {
      // Synchronous Rust error (e.g. server not found, vault locked) — clean up
      // then re-throw so the caller gets the real error, not a null.
      teardownResources(sessionId);
      set((state) => dropFromState(state, sessionId));
      throw e;
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
    const { serverId, serverName, broadcastGroupId } = session;
    teardownResources(sessionId);
    set((state) => dropFromState(state, sessionId));
    await get().openSession(serverId, serverName, broadcastGroupId);
  },

  setActive: (sessionId) => set({ activeSessionId: sessionId }),
  reorderSessions: (sessions) => set({ sessions }),

  renameSession: (sessionId, name) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, customName: name.trim() || undefined } : s,
      ),
    })),

  removeSession: (sessionId) => {
    // Guard against double-removal (e.g. closeSession + terminal:closed race)
    if (!get().sessions.find((s) => s.id === sessionId)) return;

    teardownResources(sessionId);
    set((state) => dropFromState(state, sessionId));
  },
}));
