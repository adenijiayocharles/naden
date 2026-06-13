import { invoke } from "@tauri-apps/api/core";
import { writeText as clipboardWriteText } from "@tauri-apps/plugin-clipboard-manager";
import { check as checkForUpdate } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import type { LogEntry } from "../types/log";
import type {
  Server,
  Group,
  Tag,
  CreateServerPayload,
  UpdateServerPayload,
  ImportPreview,
} from "../types/server";
import type { Snippet, CreateSnippetPayload, UpdateSnippetPayload } from "../types/snippet";
import type { Playbook, CreatePlaybookPayload, UpdatePlaybookPayload } from "../types/playbook";
import type { DirListing } from "../types/sftp";
import type { LocalFileEntry } from "../types/local";
import type {
  PortForward,
  CreatePortForwardPayload,
  UpdatePortForwardPayload,
} from "../types/portForward";
import type { SshKey } from "../types/sshKey";

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

export const sshCommands = {
  launchInTerminal: (serverId: string) =>
    invoke<void>("launch_in_terminal", { serverId }),

  importSshConfig: (path?: string) =>
    invoke<ImportPreview[]>("import_ssh_config", { path: path ?? null }),

  confirmSshConfigImport: (previews: ImportPreview[]) =>
    invoke<Server[]>("confirm_ssh_config_import", { previews }),
};

export const terminalCommands = {
  openTerminalSession: (serverId: string, sessionId: string) =>
    invoke<void>("open_terminal_session", { serverId, sessionId }),

  closeTerminalSession: (sessionId: string) =>
    invoke<void>("close_terminal_session", { sessionId }),

  sendTerminalInput: (sessionId: string, data: string) =>
    invoke<void>("send_terminal_input", { sessionId, data }),

  resizeTerminal: (sessionId: string, cols: number, rows: number) =>
    invoke<void>("resize_terminal", { sessionId, cols, rows }),

  removeKnownHostEntry: (host: string, port: number) =>
    invoke<number>("remove_known_host_entry", { host, port }),
};

export const settingsCommands = {
  getSetting: (key: string) =>
    invoke<string | null>("get_setting", { key }),

  setSetting: (key: string, value: string) =>
    invoke<void>("set_setting", { key, value }),

  vaultHeartbeat: () =>
    invoke<void>("vault_heartbeat"),
};

export const vaultCommands = {
  storeCredential: (secret: string) =>
    invoke<string>("store_credential", { secret }),

  retrieveCredential: (vaultCredentialId: string) =>
    invoke<string>("retrieve_credential", { vaultCredentialId }),

  deleteCredential: (vaultCredentialId: string) =>
    invoke<void>("delete_credential", { vaultCredentialId }),

};

export interface AssistantStatus {
  openaiConfigured: boolean;
  anthropicConfigured: boolean;
  activeProvider: string | null;
  enabled: boolean;
  persistHistory: boolean;
}

export interface AssistantChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const assistantCommands = {
  setApiKey: (provider: string, apiKey: string) =>
    invoke<void>("set_assistant_api_key", { provider, apiKey }),

  clearApiKey: () =>
    invoke<void>("clear_assistant_api_key"),

  clearProviderKey: (provider: string) =>
    invoke<void>("clear_assistant_provider_key", { provider }),

  switchProvider: (provider: string) =>
    invoke<void>("switch_assistant_provider", { provider }),

  setEnabled: (enabled: boolean) =>
    invoke<void>("set_assistant_enabled", { enabled }),

  getStatus: () =>
    invoke<AssistantStatus>("get_assistant_status"),

  // Dispatches the conversation and returns immediately — the reply streams
  // back via assistant:token/done/error:{requestId} events (see assistantStore).
  sendMessage: (requestId: string, messages: AssistantChatMessage[]) =>
    invoke<void>("send_assistant_message", { requestId, messages }),

  setPersistHistory: (enabled: boolean) =>
    invoke<void>("set_assistant_persist_history", { enabled }),

  // `payload` is a JSON-serialised per-server transcript, encrypted at rest
  // through the vault before it touches disk (see assistantStore).
  saveChatHistory: (serverId: string, payload: string) =>
    invoke<void>("save_assistant_chat_history", { serverId, payload }),

  loadChatHistory: (serverId: string) =>
    invoke<string | null>("load_assistant_chat_history", { serverId }),
};

export const localCommands = {
  getLocalHomeDir: () =>
    invoke<string>("get_local_home_dir"),

  listLocalDir: (path: string) =>
    invoke<LocalFileEntry[]>("list_local_dir", { path }),

  createLocalDir: (path: string) =>
    invoke<void>("create_local_dir", { path }),

  createLocalFile: (path: string) =>
    invoke<void>("create_local_file", { path }),

  renameLocal: (from: string, to: string) =>
    invoke<void>("rename_local", { from, to }),

  deleteLocal: (path: string) =>
    invoke<void>("delete_local", { path }),

  revealInFinder: (path: string) =>
    invoke<void>("reveal_in_finder", { path }),

  openLocal: (path: string) =>
    invoke<void>("open_local", { path }),
};

export const sftpCommands = {
  openSftpSession: (serverId: string, sessionId: string) =>
    invoke<void>("open_sftp_session", { serverId, sessionId }),

  closeSftpSession: (sessionId: string) =>
    invoke<void>("close_sftp_session", { sessionId }),

  listSftpDir: (sessionId: string, path: string) =>
    invoke<DirListing>("list_sftp_dir", { sessionId, path }),

  mkdirSftp: (sessionId: string, path: string) =>
    invoke<void>("mkdir_sftp", { sessionId, path }),

  deleteSftp: (sessionId: string, path: string) =>
    invoke<void>("delete_sftp", { sessionId, path }),

  renameSftp: (sessionId: string, from: string, to: string) =>
    invoke<void>("rename_sftp", { sessionId, from, to }),

  uploadSftpFile: (sessionId: string, localPath: string, remotePath: string) =>
    invoke<void>("upload_sftp_file", { sessionId, localPath, remotePath }),

  downloadSftpFile: (sessionId: string, remotePath: string, localPath: string) =>
    invoke<void>("download_sftp_file", { sessionId, remotePath, localPath }),

  touchSftpFile: (sessionId: string, path: string) =>
    invoke<void>("touch_sftp_file", { sessionId, path }),

  chmodSftp: (sessionId: string, path: string, mode: number) =>
    invoke<void>("chmod_sftp", { sessionId, path, mode }),

  openSftpEdit: (sessionId: string, path: string) =>
    invoke<string>("open_sftp_edit", { sessionId, path }),

  closeSftpEdit: (sessionId: string, remotePath: string) =>
    invoke<void>("close_sftp_edit", { sessionId, remotePath }),

  copySftpFile: (sessionId: string, src: string, dest: string) =>
    invoke<void>("copy_sftp_file", { sessionId, src, dest }),

  crossCopySftpFiles: (srcSessionId: string, srcPaths: string[], dstSessionId: string, dstDir: string) =>
    invoke<void>("cross_copy_sftp_file", { srcSessionId, srcPaths, dstSessionId, dstDir }),
};

export const clipboardCommands = {
  writeText: (text: string) => clipboardWriteText(text),
};

export const snippetCommands = {
  listSnippets: () =>
    invoke<Snippet[]>("list_snippets"),

  createSnippet: (payload: CreateSnippetPayload) =>
    invoke<Snippet>("create_snippet", { payload }),

  updateSnippet: (id: string, payload: UpdateSnippetPayload) =>
    invoke<Snippet>("update_snippet", { id, payload }),

  deleteSnippet: (id: string) =>
    invoke<void>("delete_snippet", { id }),
};

export const playbookCommands = {
  listPlaybooks: () =>
    invoke<Playbook[]>("list_playbooks"),

  createPlaybook: (payload: CreatePlaybookPayload) =>
    invoke<Playbook>("create_playbook", { payload }),

  updatePlaybook: (id: string, payload: UpdatePlaybookPayload) =>
    invoke<Playbook>("update_playbook", { id, payload }),

  deletePlaybook: (id: string) =>
    invoke<void>("delete_playbook", { id }),
};

export const logCommands = {
  listLogs: (
    offset: number,
    limit: number,
    serverId?: string,
    startDate?: string,
    endDate?: string,
  ) =>
    invoke<LogEntry[]>("list_logs", {
      offset,
      limit,
      serverId: serverId ?? null,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
    }),

  exportLogsCsv: (serverId?: string, startDate?: string, endDate?: string) =>
    invoke<string>("export_logs_csv", {
      serverId: serverId ?? null,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
    }),

  clearLogs: () => invoke<void>("clear_logs"),

  getLastConnectedMap: () =>
    invoke<Record<string, string>>("get_last_connected_map"),
};

export const trayCommands = {
  updateMenu: (servers: { id: string; displayName: string; hostname: string }[]) =>
    invoke<void>("update_tray_menu", { servers }),
};

export const keyCommands = {
  listSshKeys: () =>
    invoke<SshKey[]>("list_ssh_keys"),

  addSshKey: (path: string, name?: string) =>
    invoke<SshKey>("add_ssh_key", { path, name: name ?? null }),

  removeSshKey: (id: string) =>
    invoke<void>("remove_ssh_key", { id }),

  generateSshKey: (name: string, keyType: string, outputPath: string, passphrase?: string) =>
    invoke<SshKey>("generate_ssh_key", { name, keyType, outputPath, passphrase: passphrase ?? null }),

  getPublicKey: (id: string) =>
    invoke<string>("get_public_key", { id }),

  renameSshKey: (id: string, name: string) =>
    invoke<SshKey>("rename_ssh_key", { id, name }),
};

export const tunnelCommands = {
  listPortForwards: (serverId?: string) =>
    invoke<PortForward[]>("list_port_forwards", { serverId: serverId ?? null }),

  createPortForward: (payload: CreatePortForwardPayload) =>
    invoke<PortForward>("create_port_forward", { payload }),

  updatePortForward: (id: string, payload: UpdatePortForwardPayload) =>
    invoke<PortForward>("update_port_forward", { id, payload }),

  deletePortForward: (id: string) =>
    invoke<void>("delete_port_forward", { id }),

  startTunnel: (forwardId: string) =>
    invoke<void>("start_tunnel", { forwardId }),

  stopTunnel: (forwardId: string) =>
    invoke<void>("stop_tunnel", { forwardId }),

  listActiveTunnelIds: () =>
    invoke<string[]>("list_active_tunnel_ids"),
};

export interface UpdateInfo {
  version: string;
  date?: string;
  body?: string;
  download: () => Promise<void>;
}

export const updaterCommands = {
  checkForUpdate: async (): Promise<UpdateInfo | null> => {
    const update = await checkForUpdate();
    if (!update) return null;
    return {
      version: update.version,
      date: update.date,
      body: update.body,
      download: async () => {
        await update.downloadAndInstall();
      },
    };
  },

  relaunch: () => relaunch(),
};
