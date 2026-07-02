import { invoke } from "@tauri-apps/api/core";

export const settingsCommands = {
  getSetting: (key: string) =>
    invoke<string | null>("get_setting", { key }),

  getAllSettings: () =>
    invoke<Record<string, string>>("get_all_settings"),

  setSetting: (key: string, value: string) =>
    invoke<void>("set_setting", { key, value }),

  vaultHeartbeat: () =>
    invoke<void>("vault_heartbeat"),
};

export const crashReportingCommands = {
  isAvailable: () =>
    invoke<boolean>("crash_reporting_is_available"),
};
