import { create } from "zustand";
import { terminalCommands } from "../lib/tauriCommands";
import { isDestructiveCommand } from "../lib/destructiveCommands";
import { useTerminalStore } from "./terminalStore";

export { isDestructiveCommand } from "../lib/destructiveCommands";

export interface BroadcastGroup {
  id: string;
  name: string;
  sessionIds: string[];
}

interface BroadcastStore {
  groups: BroadcastGroup[];
  activeGroupId: string | null;
  // Sessions temporarily detached from the active group's fan-out
  excludedSessionIds: Set<string>;
  // Pending input held back pending destructive-command confirmation
  pendingInput: string | null;

  createGroup: (name: string, sessionIds: string[]) => string;
  disbandGroup: (groupId: string) => void;
  setActiveGroup: (groupId: string | null) => void;
  toggleExcluded: (sessionId: string) => void;
  broadcastInput: (data: string) => Promise<void>;
  confirmPendingInput: () => Promise<void>;
  cancelPendingInput: () => void;
}

export const useBroadcastStore = create<BroadcastStore>((set, get) => ({
  groups: [],
  activeGroupId: null,
  excludedSessionIds: new Set(),
  pendingInput: null,

  createGroup: (name, sessionIds) => {
    const id = crypto.randomUUID();
    set((state) => ({
      groups: [...state.groups, { id, name, sessionIds }],
      activeGroupId: id,
      excludedSessionIds: new Set(),
    }));
    return id;
  },

  disbandGroup: (groupId) => {
    set((state) => ({
      groups: state.groups.filter((g) => g.id !== groupId),
      activeGroupId: state.activeGroupId === groupId ? null : state.activeGroupId,
      excludedSessionIds: state.activeGroupId === groupId ? new Set() : state.excludedSessionIds,
    }));
  },

  setActiveGroup: (groupId) => set({ activeGroupId: groupId, excludedSessionIds: new Set() }),

  toggleExcluded: (sessionId) =>
    set((state) => {
      const next = new Set(state.excludedSessionIds);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return { excludedSessionIds: next };
    }),

  broadcastInput: async (data) => {
    if (isDestructiveCommand(data)) {
      set({ pendingInput: data });
      return;
    }
    await sendToGroup(get(), data);
  },

  confirmPendingInput: async () => {
    const { pendingInput } = get();
    if (pendingInput === null) return;
    set({ pendingInput: null });
    await sendToGroup(get(), pendingInput);
  },

  cancelPendingInput: () => set({ pendingInput: null }),
}));

async function sendToGroup(state: BroadcastStore, data: string) {
  const group = state.groups.find((g) => g.id === state.activeGroupId);
  if (!group) return;

  const liveSessionIds = new Set(useTerminalStore.getState().sessions.map((s) => s.id));
  const targets = group.sessionIds.filter(
    (id) => liveSessionIds.has(id) && !state.excludedSessionIds.has(id),
  );

  await Promise.all(targets.map((id) => terminalCommands.sendTerminalInput(id, data)));
}
