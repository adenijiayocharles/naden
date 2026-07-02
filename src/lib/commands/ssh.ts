import { invoke } from "@tauri-apps/api/core";
import type { ImportPreview } from "../../types/server";

export const sshCommands = {
  launchInTerminal: (serverId: string) =>
    invoke<void>("launch_in_terminal", { serverId }),

  importSshConfig: (path?: string) =>
    invoke<ImportPreview[]>("import_ssh_config", { path: path ?? null }),

  confirmSshConfigImport: (previews: ImportPreview[]) =>
    invoke<import("../../types/server").Server[]>("confirm_ssh_config_import", { previews }),

  exportSshConfig: () =>
    invoke<number>("export_ssh_config"),
};
