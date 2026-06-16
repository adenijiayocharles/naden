import { create } from "zustand";
import { broadcastCommands, type SavedBroadcastGroup } from "../lib/tauriCommands";
import { terminalCommands } from "../lib/tauriCommands";
import { isDestructiveCommand } from "../lib/destructiveCommands";
import { useTerminalStore } from "./terminalStore";
import { useServerStore } from "./serverStore";

export { isDestructiveCommand } from "../lib/destructiveCommands";
export type { SavedBroadcastGroup };

export interface BroadcastGroup {
  id: string;
  name: string;
  sessionIds: string[];
  /** Server IDs this group was created from — present for persisted groups. */
  serverIds?: string[];
  /** DB-persisted group ID that backs this in-memory group (if saved). */
  savedId?: string;
}

interface BroadcastStore {
  groups: BroadcastGroup[];
  activeGroupId: string | null;
  savedGroups: SavedBroadcastGroup[];
  // Sessions temporarily detached from the active group's fan-out
  excludedSessionIds: Set<string>;
  // Pending input held back pending destructive-command confirmation
  pendingInput: string | null;

  createGroup: (name: string, sessionIds: string[], serverIds?: string[]) => Promise<string>;
  disbandGroup: (groupId: string) => void;
  setActiveGroup: (groupId: string | null) => void;
  toggleExcluded: (sessionId: string) => void;
  broadcastInput: (data: string) => Promise<void>;
  confirmPendingInput: () => Promise<void>;
  cancelPendingInput: () => void;
  loadSaved: () => Promise<void>;
  deleteSaved: (savedId: string) => Promise<void>;
  reactivateGroup: (savedId: string) => Promise<void>;
}

export const useBroadcastStore = create<BroadcastStore>((set, get) => ({
  groups: [],
  activeGroupId: null,
  savedGroups: [],
  excludedSessionIds: new Set(),
  pendingInput: null,

  createGroup: async (name, sessionIds, serverIds) => {
    const id = crypto.randomUUID();
    let savedId: string | undefined;
    if (serverIds && serverIds.length > 0) {
      try {
        const saved = await broadcastCommands.createBroadcastGroup(name, serverIds);
        savedId = saved.id;
        set((state) => ({ savedGroups: [...state.savedGroups, saved] }));
      } catch {
        // Persist failure is non-fatal — the in-memory group still works
      }
    }
    set((state) => ({
      groups: [...state.groups, { id, name, sessionIds, serverIds, savedId }],
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

  loadSaved: async () => {
    try {
      const savedGroups = await broadcastCommands.listBroadcastGroups();
      set({ savedGroups });
    } catch {
      // Non-fatal — app works without persisted groups
    }
  },

  deleteSaved: async (savedId) => {
    await broadcastCommands.deleteBroadcastGroup(savedId);
    set((state) => ({
      savedGroups: state.savedGroups.filter((g) => g.id !== savedId),
    }));
  },

  reactivateGroup: async (savedId) => {
    const saved = get().savedGroups.find((g) => g.id === savedId);
    if (!saved) return;

    const servers = useServerStore.getState().servers;
    const openSession = useTerminalStore.getState().openSession;

    const sessionIds: string[] = [];
    for (const serverId of saved.serverIds) {
      const server = servers.find((s) => s.id === serverId);
      if (!server) continue;
      const sessionId = await openSession(server.id, server.displayName);
      if (sessionId) sessionIds.push(sessionId);
    }
    if (sessionIds.length === 0) return;

    const runtimeId = crypto.randomUUID();
    set((state) => ({
      groups: [
        ...state.groups,
        { id: runtimeId, name: saved.name, sessionIds, serverIds: saved.serverIds, savedId },
      ],
      activeGroupId: runtimeId,
      excludedSessionIds: new Set(),
    }));
  },
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
