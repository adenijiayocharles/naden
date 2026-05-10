import { invoke } from "@tauri-apps/api/core";
import type { AuditEntry } from "../types/audit";
import type {
  Server,
  Group,
  Tag,
  CreateServerPayload,
  UpdateServerPayload,
  ImportPreview,
} from "../types/server";
import type { DirListing } from "../types/sftp";

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

export const settingsCommands = {
  getSetting: (key: string) =>
    invoke<string | null>("get_setting", { key }),

  setSetting: (key: string, value: string) =>
    invoke<void>("set_setting", { key, value }),

  vaultHeartbeat: () =>
    invoke<void>("vault_heartbeat"),
};

export interface ImportSummary {
  serversImported: number;
  groupsImported: number;
  tagsImported: number;
  serversSkipped: number;
}

export const backupCommands = {
  exportBackup: (password: string, path: string) =>
    invoke<void>("export_backup", { password, path }),

  importBackup: (path: string, password: string) =>
    invoke<ImportSummary>("import_backup", { path, password }),
};

export const vaultCommands = {
  storeCredential: (secret: string) =>
    invoke<string>("store_credential", { secret }),

  retrieveCredential: (vaultCredentialId: string) =>
    invoke<string>("retrieve_credential", { vaultCredentialId }),

  deleteCredential: (vaultCredentialId: string) =>
    invoke<void>("delete_credential", { vaultCredentialId }),
};

export const sftpCommands = {
  openSftpSession: (serverId: string) =>
    invoke<string>("open_sftp_session", { serverId }),

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
};

export const auditCommands = {
  listAuditLog: (
    offset: number,
    limit: number,
    serverId?: string,
    startDate?: string,
    endDate?: string,
  ) =>
    invoke<AuditEntry[]>("list_audit_log", {
      offset,
      limit,
      serverId: serverId ?? null,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
    }),

  exportAuditCsv: (serverId?: string, startDate?: string, endDate?: string) =>
    invoke<string>("export_audit_csv", {
      serverId: serverId ?? null,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
    }),

  getLastConnectedMap: () =>
    invoke<Record<string, string>>("get_last_connected_map"),
};
