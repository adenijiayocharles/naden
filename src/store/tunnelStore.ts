import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { tunnelCommands } from "../lib/commands/tunnels";
import type {
  CreatePortForwardPayload,
  PortForward,
  TunnelStatus,
  UpdatePortForwardPayload,
} from "../types/portForward";

interface TunnelStatusEvent {
  status: "active" | "stopped" | "error" | "connecting";
  error?: string;
}

interface TunnelStore {
  forwards: PortForward[];
  statuses: Record<string, TunnelStatus>;
  errors: Record<string, string | undefined>;

  load: (serverId?: string) => Promise<void>;
  create: (payload: CreatePortForwardPayload) => Promise<PortForward>;
  update: (id: string, payload: UpdatePortForwardPayload) => Promise<PortForward>;
  remove: (id: string) => Promise<void>;
  startTunnel: (id: string) => Promise<void>;
  stopTunnel: (id: string) => Promise<void>;
  refreshActiveTunnels: () => Promise<void>;
}

export const useTunnelStore = create<TunnelStore>((set, get) => ({
  forwards: [],
  statuses: {},
  errors: {},

  load: async (serverId) => {
    const forwards = await tunnelCommands.listPortForwards(serverId);
    const activeIds = await tunnelCommands.listActiveTunnelIds();

    const statuses: Record<string, TunnelStatus> = {};
    for (const fwd of forwards) {
      statuses[fwd.id] = activeIds.includes(fwd.id) ? "active" : "idle";
    }

    if (serverId) {
      // Merge: keep statuses and forwards for other servers, replace this server's entries.
      set((s) => ({
        forwards: [
          ...s.forwards.filter((f) => f.serverId !== serverId),
          ...forwards,
        ],
        statuses: { ...s.statuses, ...statuses },
      }));
    } else {
      // Full reload: clean up any stale listeners before replacing state.
      for (const unlisten of unlisteners.values()) {
        unlisten();
      }
      unlisteners.clear();
      set({ forwards, statuses });
    }

    // Subscribe to live status events for each forward.
    for (const fwd of forwards) {
      void subscribeToForward(fwd.id);
    }
  },

  create: async (payload) => {
    const fwd = await tunnelCommands.createPortForward(payload);
    set((s) => ({
      forwards: [...s.forwards, fwd],
      statuses: { ...s.statuses, [fwd.id]: "idle" },
    }));
    void subscribeToForward(fwd.id);
    return fwd;
  },

  update: async (id, payload) => {
    const fwd = await tunnelCommands.updatePortForward(id, payload);
    set((s) => ({
      forwards: s.forwards.map((f) => (f.id === id ? fwd : f)),
    }));
    return fwd;
  },

  remove: async (id) => {
    // Stop if active before deleting.
    if (get().statuses[id] === "active") {
      await tunnelCommands.stopTunnel(id).catch(() => {});
    }
    await tunnelCommands.deletePortForward(id);
    unsubscribeFromForward(id);
    set((s) => {
      const statuses = { ...s.statuses };
      const errors = { ...s.errors };
      delete statuses[id];
      delete errors[id];
      return {
        forwards: s.forwards.filter((f) => f.id !== id),
        statuses,
        errors,
      };
    });
  },

  startTunnel: async (id) => {
    set((s) => ({ statuses: { ...s.statuses, [id]: "connecting" } }));
    try {
      await tunnelCommands.startTunnel(id);
    } catch (e) {
      set((s) => ({
        statuses: { ...s.statuses, [id]: "error" },
        errors: { ...s.errors, [id]: String(e) },
      }));
      throw e;
    }
  },

  stopTunnel: async (id) => {
    await tunnelCommands.stopTunnel(id);
    set((s) => ({ statuses: { ...s.statuses, [id]: "idle" } }));
  },

  refreshActiveTunnels: async () => {
    const activeIds = await tunnelCommands.listActiveTunnelIds();
    set((s) => {
      const statuses = { ...s.statuses };
      for (const id of Object.keys(statuses)) {
        if (statuses[id] !== "connecting") {
          statuses[id] = activeIds.includes(id) ? "active" : "idle";
        }
      }
      return { statuses };
    });
  },
}));

// Maps forward_id → unlisten function so subscriptions can be cleaned up when
// a forward is deleted or when the module hot-reloads in development.
const unlisteners = new Map<string, () => void>();

async function subscribeToForward(forwardId: string) {
  if (unlisteners.has(forwardId)) return;

  // Store a placeholder to prevent concurrent duplicate subscriptions while
  // the async listen() call is in-flight.
  unlisteners.set(forwardId, () => {});

  try {
    const unlisten = await listen<TunnelStatusEvent>(`tunnel:status:${forwardId}`, (event) => {
      const { status, error } = event.payload;
      useTunnelStore.setState((s) => ({
        statuses: {
          ...s.statuses,
          [forwardId]: status === "active"
            ? "active"
            : status === "connecting"
            ? "connecting"
            : "idle",
        },
        errors: {
          ...s.errors,
          [forwardId]: status === "error" ? error : undefined,
        },
      }));
    });
    // Replace placeholder with the real unlisten handle.
    unlisteners.set(forwardId, unlisten);
  } catch {
    // If listen() fails, clear the placeholder so a future call can retry.
    unlisteners.delete(forwardId);
  }
}

function unsubscribeFromForward(forwardId: string) {
  const unlisten = unlisteners.get(forwardId);
  if (unlisten) {
    unlisten();
    unlisteners.delete(forwardId);
  }
}
