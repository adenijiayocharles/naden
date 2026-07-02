import { invoke } from "@tauri-apps/api/core";
import type { LogEntry } from "../../types/log";
import type { SessionLog } from "../../types/sessionLog";

export interface SessionLogMeta {
  id: string;
}

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

export const sessionLogCommands = {
  createSessionLog: (serverDisplayName: string, serverId?: string) =>
    invoke<SessionLogMeta>("create_session_log", {
      serverDisplayName,
      serverId: serverId ?? null,
    }),

  appendSessionLog: (logId: string, dataBase64: string) =>
    invoke<void>("append_session_log", { logId, dataBase64 }),

  finishSessionLog: (logId: string) =>
    invoke<void>("finish_session_log", { logId }),

  listSessionLogs: (serverId?: string, limit?: number, offset?: number) =>
    invoke<SessionLog[]>("list_session_logs", {
      serverId: serverId ?? null,
      limit: limit ?? null,
      offset: offset ?? null,
    }),

  deleteSessionLog: (logId: string) =>
    invoke<void>("delete_session_log", { logId }),

  revealSessionLog: (logId: string) =>
    invoke<void>("reveal_session_log", { logId }),
};
