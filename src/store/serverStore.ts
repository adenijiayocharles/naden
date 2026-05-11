import { create } from "zustand";
import { serverCommands, logCommands, type ReachabilityResult } from "../lib/tauriCommands";
import type {
  Server,
  Group,
  Tag,
  CreateServerPayload,
  UpdateServerPayload,
} from "../types/server";

interface ReachabilityInfo extends ReachabilityResult {
  checking: boolean;
}

interface ServerStore {
  servers: Server[];
  groups: Group[];
  tags: Tag[];
  isLoading: boolean;
  error: string | null;
  reachability: Record<string, ReachabilityInfo>;
  lastConnectedMap: Record<string, string>;

  fetchAll: () => Promise<void>;
  createServer: (payload: CreateServerPayload) => Promise<Server>;
  updateServer: (id: string, payload: UpdateServerPayload) => Promise<Server>;
  deleteServer: (id: string) => Promise<void>;
  moveServerGroup: (serverId: string, groupId: string | null) => Promise<void>;
  toggleFavourite: (serverId: string) => Promise<void>;
  duplicateServer: (serverId: string) => Promise<Server>;
  createGroup: (name: string, color?: string) => Promise<Group>;
  updateGroup: (groupId: string, name: string, color?: string) => Promise<Group>;
  deleteGroup: (groupId: string) => Promise<void>;
  createTag: (name: string) => Promise<Tag>;
  checkReachability: (serverId: string) => Promise<void>;
}

export const useServerStore = create<ServerStore>((set) => ({
  servers: [],
  groups: [],
  tags: [],
  isLoading: false,
  error: null,
  reachability: {},
  lastConnectedMap: {},

  fetchAll: async () => {
    set({ isLoading: true, error: null });
    try {
      const [servers, groups, tags] = await Promise.all([
        serverCommands.listServers(),
        serverCommands.listGroups(),
        serverCommands.listTags(),
      ]);
      set({ servers, groups, tags });
      logCommands.getLastConnectedMap()
        .then((map) => set({ lastConnectedMap: map }))
        .catch(() => {});
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ isLoading: false });
    }
  },

  createServer: async (payload) => {
    const server = await serverCommands.createServer(payload);
    set((s) => ({ servers: [...s.servers, server] }));
    return server;
  },

  updateServer: async (id, payload) => {
    const updated = await serverCommands.updateServer(id, payload);
    set((s) => ({
      servers: s.servers.map((sv) => (sv.id === id ? updated : sv)),
    }));
    return updated;
  },

  deleteServer: async (id) => {
    await serverCommands.deleteServer(id);
    set((s) => ({ servers: s.servers.filter((sv) => sv.id !== id) }));
  },

  moveServerGroup: async (serverId, groupId) => {
    const server = await serverCommands.moveServerGroup(serverId, groupId);
    set((s) => ({
      servers: s.servers.map((sv) => (sv.id === serverId ? server : sv)),
    }));
  },

  toggleFavourite: async (serverId) => {
    const server = await serverCommands.toggleFavourite(serverId);
    set((s) => ({
      servers: s.servers.map((sv) => (sv.id === serverId ? server : sv)),
    }));
  },

  duplicateServer: async (serverId) => {
    const server = await serverCommands.duplicateServer(serverId);
    set((s) => ({ servers: [...s.servers, server] }));
    return server;
  },

  createGroup: async (name, color) => {
    const group = await serverCommands.createGroup(name, color);
    set((s) => ({ groups: [...s.groups, group] }));
    return group;
  },

  updateGroup: async (groupId, name, color) => {
    const group = await serverCommands.updateGroup(groupId, name, color);
    set((s) => ({ groups: s.groups.map((g) => (g.id === groupId ? group : g)) }));
    return group;
  },

  deleteGroup: async (groupId) => {
    await serverCommands.deleteGroup(groupId);
    set((s) => ({
      groups: s.groups.filter((g) => g.id !== groupId),
      servers: s.servers.map((sv) => sv.groupId === groupId ? { ...sv, groupId: undefined } : sv),
    }));
  },

  createTag: async (name) => {
    const tag = await serverCommands.createTag(name);
    set((s) => ({
      tags: s.tags.some((t) => t.id === tag.id) ? s.tags : [...s.tags, tag],
    }));
    return tag;
  },

  checkReachability: async (serverId) => {
    set((s) => ({
      reachability: { ...s.reachability, [serverId]: { reachable: false, checking: true } },
    }));
    try {
      const result = await serverCommands.checkReachability(serverId);
      set((s) => ({
        reachability: { ...s.reachability, [serverId]: { ...result, checking: false } },
      }));
    } catch {
      set((s) => ({
        reachability: { ...s.reachability, [serverId]: { reachable: false, checking: false } },
      }));
    }
  },
}));
