import { create } from "zustand";
import { serverCommands } from "../lib/tauriCommands";
import type {
  Server,
  Group,
  Tag,
  CreateServerPayload,
  UpdateServerPayload,
} from "../types/server";

interface ServerStore {
  servers: Server[];
  groups: Group[];
  tags: Tag[];
  isLoading: boolean;
  error: string | null;

  fetchAll: () => Promise<void>;
  createServer: (payload: CreateServerPayload) => Promise<Server>;
  updateServer: (id: string, payload: UpdateServerPayload) => Promise<Server>;
  deleteServer: (id: string) => Promise<void>;
  createGroup: (name: string, color?: string) => Promise<Group>;
  createTag: (name: string) => Promise<Tag>;
}

export const useServerStore = create<ServerStore>((set) => ({
  servers: [],
  groups: [],
  tags: [],
  isLoading: false,
  error: null,

  fetchAll: async () => {
    set({ isLoading: true, error: null });
    try {
      const [servers, groups, tags] = await Promise.all([
        serverCommands.listServers(),
        serverCommands.listGroups(),
        serverCommands.listTags(),
      ]);
      set({ servers, groups, tags });
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

  createGroup: async (name, color) => {
    const group = await serverCommands.createGroup(name, color);
    set((s) => ({ groups: [...s.groups, group] }));
    return group;
  },

  createTag: async (name) => {
    const tag = await serverCommands.createTag(name);
    set((s) => ({
      tags: s.tags.some((t) => t.id === tag.id) ? s.tags : [...s.tags, tag],
    }));
    return tag;
  },
}));
