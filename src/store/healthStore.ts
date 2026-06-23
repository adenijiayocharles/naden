import { create } from "zustand";

import { healthCommands } from "../lib/tauriCommands";
import { useTerminalStore } from "./terminalStore";

export interface ServerHealth {
  serverId: string;
  cpuPercent: number;
  memPercent: number;
  diskPercent: number;
  timestamp: number;
}

interface HealthStore {
  health: Record<string, ServerHealth>;
  fetching: Set<string>;
  errors: Record<string, string>;
  fetchHealth: (serverId: string) => Promise<void>;
  clearHealth: (serverId: string) => void;
}

export const useHealthStore = create<HealthStore>((set, get) => ({
  health: {},
  fetching: new Set(),
  errors: {},

  fetchHealth: async (serverId) => {
    if (get().fetching.has(serverId)) return;
    set((s) => ({ fetching: new Set([...s.fetching, serverId]) }));
    try {
      const data = await healthCommands.fetchServerHealth(serverId);
      set((s) => ({
        health: { ...s.health, [serverId]: data },
        fetching: new Set([...s.fetching].filter((id) => id !== serverId)),
        errors: Object.fromEntries(Object.entries(s.errors).filter(([k]) => k !== serverId)),
      }));
    } catch (e) {
      set((s) => ({
        fetching: new Set([...s.fetching].filter((id) => id !== serverId)),
        errors: { ...s.errors, [serverId]: String(e) },
      }));
    }
  },

  clearHealth: (serverId) =>
    set((s) => {
      const { [serverId]: _, ...rest } = s.health;
      const { [serverId]: _e, ...restErrors } = s.errors;
      return { health: rest, errors: restErrors };
    }),
}));

// Subscribe with an early-return key comparison so the callback only does real
// work when the SET of connected server IDs actually changes — not on every
// terminal output chunk (which is the dominant update frequency).
let prevKey = "";
useTerminalStore.subscribe((state) => {
  const nowKey = state.sessions
    .filter((s) => s.status === "connected" && s.kind === "ssh")
    .map((s) => s.serverId)
    .sort()
    .join("\0");
  if (nowKey === prevKey) return;

  const now = new Set(nowKey ? nowKey.split("\0") : []);
  const prev = new Set(prevKey ? prevKey.split("\0") : []);
  prevKey = nowKey;

  for (const id of now) {
    if (!prev.has(id)) void useHealthStore.getState().fetchHealth(id);
  }
  for (const id of prev) {
    if (!now.has(id)) useHealthStore.getState().clearHealth(id);
  }
});
