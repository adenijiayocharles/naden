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

  createGroup: (name: string, sessionIds: string[], serverIds?: string[], groupId?: string) => Promise<string>;
  disbandGroup: (groupId: string) => void;
  setActiveGroup: (groupId: string | null) => void;
  toggleExcluded: (sessionId: string) => void;
  broadcastInput: (data: string) => Promise<void>;
  confirmPendingInput: () => Promise<void>;
  cancelPendingInput: () => void;
  loadSaved: () => Promise<void>;
  updateSaved: (savedId: string, name: string, serverIds: string[]) => Promise<void>;
  deleteSaved: (savedId: string) => Promise<void>;
  reactivateGroup: (savedId: string) => Promise<void>;
}

export const useBroadcastStore = create<BroadcastStore>((set, get) => ({
  groups: [],
  activeGroupId: null,
  savedGroups: [],
  excludedSessionIds: new Set(),
  pendingInput: null,

  createGroup: async (name, sessionIds, serverIds, groupId) => {
    const id = groupId ?? crypto.randomUUID();
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
    // Close all sessions carrying this group's ID — covers reconnected sessions
    // whose IDs are no longer in the original group.sessionIds list
    const { sessions, closeSession } = useTerminalStore.getState();
    for (const session of sessions) {
      if (session.broadcastGroupId === groupId) void closeSession(session.id);
    }
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

  updateSaved: async (savedId, name, serverIds) => {
    const updated = await broadcastCommands.updateBroadcastGroup(savedId, name, serverIds);
    set((state) => ({
      savedGroups: state.savedGroups.map((g) => (g.id === savedId ? updated : g)),
      // Reflect the rename in any active in-memory group backed by this saved group
      groups: state.groups.map((g) =>
        g.savedId === savedId ? { ...g, name: updated.name, serverIds: updated.serverIds } : g,
      ),
    }));
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

    // Generate the runtime group ID before opening sessions so each session
    // is tagged immediately and never appears as an individual tab.
    const runtimeId = crypto.randomUUID();

    const sessionIds: string[] = [];
    for (const serverId of saved.serverIds) {
      const server = servers.find((s) => s.id === serverId);
      if (!server) continue;
      const sessionId = await openSession(server.id, server.displayName, runtimeId);
      if (sessionId) sessionIds.push(sessionId);
    }
    if (sessionIds.length === 0) return;

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

  const targets = useTerminalStore.getState().sessions.filter(
    (s) => s.broadcastGroupId === group.id && !state.excludedSessionIds.has(s.id),
  );

  await Promise.all(targets.map((s) => terminalCommands.sendTerminalInput(s.id, data)));
}
