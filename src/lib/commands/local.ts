import { invoke } from "@tauri-apps/api/core";
import { writeText as clipboardWriteText } from "@tauri-apps/plugin-clipboard-manager";
import type { LocalFileEntry } from "../../types/local";

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

  openUrl: (url: string) =>
    invoke<void>("open_url", { url }),
};

export const clipboardCommands = {
  writeText: (text: string) => clipboardWriteText(text),
};
