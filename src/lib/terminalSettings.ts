import { create } from "zustand";
import { settingsCommands } from "./tauriCommands";

export const TERMINAL_FONTS = [
  { id: "jetbrains-mono",  label: "JetBrains Mono",  css: "'JetBrains Mono', monospace" },
  { id: "fira-code",       label: "Fira Code",        css: "'Fira Code', monospace" },
  { id: "cascadia-code",   label: "Cascadia Code",    css: "'Cascadia Code', monospace" },
  { id: "source-code-pro", label: "Source Code Pro",  css: "'Source Code Pro', monospace" },
  { id: "hack",            label: "Hack",             css: "Hack, monospace" },
  { id: "inconsolata",     label: "Inconsolata",      css: "Inconsolata, monospace" },
  { id: "ubuntu-mono",     label: "Ubuntu Mono",      css: "'Ubuntu Mono', monospace" },
  { id: "menlo",           label: "Menlo",            css: "Menlo, monospace" },
  { id: "consolas",        label: "Consolas",         css: "Consolas, monospace" },
  { id: "system",          label: "System Default",   css: "monospace" },
] as const;

export type TerminalFontId = typeof TERMINAL_FONTS[number]["id"];

export function fontCss(id: TerminalFontId): string {
  return TERMINAL_FONTS.find((f) => f.id === id)?.css ?? "'JetBrains Mono', monospace";
}

interface TerminalSettingsStore {
  fontSize: number;
  scrollback: number;
  copyOnSelect: boolean;
  fontFamily: TerminalFontId;
  load: () => Promise<void>;
  setFontSize: (n: number) => void;
  setScrollback: (n: number) => void;
  setCopyOnSelect: (v: boolean) => void;
  setFontFamily: (id: TerminalFontId) => void;
}

export const useTerminalSettings = create<TerminalSettingsStore>((set) => ({
  fontSize: 14,
  scrollback: 1000,
  copyOnSelect: true,
  fontFamily: "jetbrains-mono",

  load: async () => {
    const [fs, sb, cos, ff] = await Promise.all([
      settingsCommands.getSetting("terminal_font_size"),
      settingsCommands.getSetting("terminal_scrollback"),
      settingsCommands.getSetting("terminal_copy_on_select"),
      settingsCommands.getSetting("terminal_font_family"),
    ]);
    set({
      fontSize: fs ? Number(fs) : 14,
      scrollback: sb ? Number(sb) : 1000,
      copyOnSelect: cos !== null ? cos === "true" : true,
      fontFamily: (ff as TerminalFontId | null) ?? "jetbrains-mono",
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

  setFontFamily: (id) => {
    set({ fontFamily: id });
    void settingsCommands.setSetting("terminal_font_family", id);
  },
}));
