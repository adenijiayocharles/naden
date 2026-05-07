import { create } from "zustand";
import { settingsCommands } from "./tauriCommands";

interface TerminalSettingsStore {
  fontSize: number;
  scrollback: number;
  copyOnSelect: boolean;
  load: () => Promise<void>;
  setFontSize: (n: number) => void;
  setScrollback: (n: number) => void;
  setCopyOnSelect: (v: boolean) => void;
}

export const useTerminalSettings = create<TerminalSettingsStore>((set) => ({
  fontSize: 14,
  scrollback: 1000,
  copyOnSelect: true,

  load: async () => {
    const [fs, sb, cos] = await Promise.all([
      settingsCommands.getSetting("terminal_font_size"),
      settingsCommands.getSetting("terminal_scrollback"),
      settingsCommands.getSetting("terminal_copy_on_select"),
    ]);
    set({
      fontSize: fs ? Number(fs) : 14,
      scrollback: sb ? Number(sb) : 1000,
      copyOnSelect: cos !== null ? cos === "true" : true,
    });
  },

  setFontSize: (n) => {
    set({ fontSize: n });
    void settingsCommands.setSetting("terminal_font_size", String(n));
  },

  setScrollback: (n) => {
    set({ scrollback: n });
    void settingsCommands.setSetting("terminal_scrollback", String(n));
  },

  setCopyOnSelect: (v) => {
    set({ copyOnSelect: v });
    void settingsCommands.setSetting("terminal_copy_on_select", String(v));
  },
}));
