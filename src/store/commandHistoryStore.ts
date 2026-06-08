import { create } from "zustand";

const MAX_HISTORY_PER_SERVER = 200;

interface CommandHistoryState {
  // serverId -> commands, most-recent-first, deduped
  recent: Map<string, string[]>;

  recordCommand: (serverId: string, command: string) => void;
  suggest: (serverId: string, prefix: string) => string | null;
}

export const useCommandHistoryStore = create<CommandHistoryState>((set, get) => ({
  recent: new Map(),

  recordCommand: (serverId, command) => {
    const trimmed = command.trim();
    if (!trimmed) return;

    set((state) => {
      const existing = state.recent.get(serverId) ?? [];
      const deduped = existing.filter((c) => c !== trimmed);
      const recent = new Map(state.recent);
      recent.set(serverId, [trimmed, ...deduped].slice(0, MAX_HISTORY_PER_SERVER));
      return { recent };
    });
  },

  suggest: (serverId, prefix) => {
    if (!prefix) return null;
    const commands = get().recent.get(serverId);
    if (!commands) return null;
    return commands.find((c) => c !== prefix && c.startsWith(prefix)) ?? null;
  },
}));
