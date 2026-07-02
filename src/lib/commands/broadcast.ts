import { invoke } from "@tauri-apps/api/core";

export interface SavedBroadcastGroup {
  id: string;
  name: string;
  serverIds: string[];
}

export const broadcastCommands = {
  listBroadcastGroups: () =>
    invoke<SavedBroadcastGroup[]>("list_broadcast_groups"),

  createBroadcastGroup: (name: string, serverIds: string[]) =>
    invoke<SavedBroadcastGroup>("create_broadcast_group", { name, serverIds }),

  updateBroadcastGroup: (id: string, name: string, serverIds: string[]) =>
    invoke<SavedBroadcastGroup>("update_broadcast_group", { id, name, serverIds }),

  deleteBroadcastGroup: (id: string) =>
    invoke<void>("delete_broadcast_group", { id }),
};
