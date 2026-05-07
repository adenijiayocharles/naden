import { invoke } from "@tauri-apps/api/core";
import type {
  Server,
  Group,
  Tag,
  CreateServerPayload,
  UpdateServerPayload,
  ImportPreview,
} from "../types/server";

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

  listGroups: () =>
    invoke<Group[]>("list_groups"),

  createGroup: (name: string, color?: string) =>
    invoke<Group>("create_group", { name, color: color ?? null }),

  listTags: () =>
    invoke<Tag[]>("list_tags"),

  createTag: (name: string) =>
    invoke<Tag>("create_tag", { name }),
};

export const sshCommands = {
  launchInTerminal: (serverId: string) =>
    invoke<void>("launch_in_terminal", { serverId }),

  importSshConfig: (path?: string) =>
    invoke<ImportPreview[]>("import_ssh_config", { path: path ?? null }),

  confirmSshConfigImport: (previews: ImportPreview[]) =>
    invoke<Server[]>("confirm_ssh_config_import", { previews }),
};

export const terminalCommands = {
  openTerminalSession: (serverId: string) =>
    invoke<string>("open_terminal_session", { serverId }),

  closeTerminalSession: (sessionId: string) =>
    invoke<void>("close_terminal_session", { sessionId }),

  sendTerminalInput: (sessionId: string, data: string) =>
    invoke<void>("send_terminal_input", { sessionId, data }),

  resizeTerminal: (sessionId: string, cols: number, rows: number) =>
    invoke<void>("resize_terminal", { sessionId, cols, rows }),
};
