import { invoke } from "@tauri-apps/api/core";
import type {
  Server,
  Group,
  Tag,
  CreateServerPayload,
  UpdateServerPayload,
} from "../../types/server";
import type { DiscoveredHost } from "../../types/discovery";

export interface ReachabilityResult {
  reachable: boolean;
  latencyMs?: number;
}

export const serverCommands = {
  listServers: () =>
    invoke<Server[]>("list_servers"),

  getServer: (id: string) =>
    invoke<Server>("get_server", { id }),

  createServer: (payload: CreateServerPayload) =>
    invoke<Server>("create_server", { payload }),

  updateServer: (id: string, payload: UpdateServerPayload) =>
    invoke<Server>("update_server", { id, payload }),

  deleteServer: (id: string) =>
    invoke<void>("delete_server", { id }),

  moveServerGroup: (serverId: string, groupId: string | null) =>
    invoke<Server>("move_server_group", { serverId, groupId }),

  toggleFavourite: (serverId: string) =>
    invoke<Server>("toggle_favourite", { serverId }),

  duplicateServer: (serverId: string) =>
    invoke<Server>("duplicate_server", { serverId }),

  checkReachability: (serverId: string) =>
    invoke<ReachabilityResult>("check_reachability", { serverId }),

  reorderServers: (ids: string[]) =>
    invoke<void>("reorder_servers", { ids }),

  listGroups: () =>
    invoke<Group[]>("list_groups"),

  createGroup: (name: string, color?: string) =>
    invoke<Group>("create_group", { name, color: color ?? null }),

  updateGroup: (groupId: string, name: string, color?: string) =>
    invoke<Group>("update_group", { groupId, name, color: color ?? null }),

  deleteGroup: (groupId: string) =>
    invoke<void>("delete_group", { groupId }),

  listTags: () =>
    invoke<Tag[]>("list_tags"),

  createTag: (name: string) =>
    invoke<Tag>("create_tag", { name }),

  updateTag: (id: string, name: string) =>
    invoke<Tag>("update_tag", { id, name }),

  deleteTag: (id: string) =>
    invoke<void>("delete_tag", { id }),
};

export const searchCommands = {
  fuzzySearch: (query: string) =>
    invoke<Server[]>("fuzzy_search", { query }),
};

export const discoveryCommands = {
  scanLan: () =>
    invoke<DiscoveredHost[]>("scan_lan_hosts"),

  importKnownHosts: () =>
    invoke<DiscoveredHost[]>("import_known_hosts"),
};
