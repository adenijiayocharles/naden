import { check as checkForUpdate } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

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
