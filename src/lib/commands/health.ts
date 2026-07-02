import { invoke } from "@tauri-apps/api/core";
import type { ServerHealth } from "../../store/healthStore";

export const healthCommands = {
  fetchServerHealth: (serverId: string) =>
    invoke<ServerHealth>("fetch_server_health", { serverId }),
};
