import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

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
  fetchHealth: (serverId: string) => Promise<void>;
  clearHealth: (serverId: string) => void;
}

export const useHealthStore = create<HealthStore>((set, get) => ({
  health: {},
  fetching: new Set(),

  fetchHealth: async (serverId) => {
    if (get().fetching.has(serverId)) return;
    set((s) => ({ fetching: new Set([...s.fetching, serverId]) }));
    try {
      const data = await invoke<ServerHealth>("fetch_server_health", { serverId });
      set((s) => ({
        health: { ...s.health, [serverId]: data },
        fetching: new Set([...s.fetching].filter((id) => id !== serverId)),
      }));
    } catch {
      set((s) => ({
        fetching: new Set([...s.fetching].filter((id) => id !== serverId)),
      }));
    }
  },

  clearHealth: (serverId) =>
    set((s) => {
      const { [serverId]: _, ...rest } = s.health;
      return { health: rest };
    }),
}));

// Auto-fetch health when a session first reaches "connected", clear when it leaves.
let prevConnected = new Set<string>();
useTerminalStore.subscribe((state) => {
  const nowConnected = new Set(
    state.sessions
      .filter((s) => s.status === "connected")
      .map((s) => s.serverId),
  );
  for (const serverId of nowConnected) {
    if (!prevConnected.has(serverId)) {
      void useHealthStore.getState().fetchHealth(serverId);
    }
  }
  for (const serverId of prevConnected) {
    if (!nowConnected.has(serverId)) {
      useHealthStore.getState().clearHealth(serverId);
    }
  }
  prevConnected = nowConnected;
});
