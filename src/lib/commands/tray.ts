import { invoke } from "@tauri-apps/api/core";

export const trayCommands = {
  updateMenu: (
    servers: { id: string; displayName: string; hostname: string; groupName?: string }[],
  ) => invoke<void>("update_tray_menu", { servers }),
};
