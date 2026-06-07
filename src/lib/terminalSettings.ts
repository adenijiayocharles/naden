import { create } from "zustand";
import { settingsCommands } from "./tauriCommands";
import type { ITheme } from "@xterm/xterm";

export const TERMINAL_FONTS = [
  { id: "jetbrains-mono",  label: "JetBrains Mono",  css: "'JetBrains Mono Variable', monospace" },
  { id: "fira-code",       label: "Fira Code",        css: "'Fira Code Variable', monospace" },
  { id: "cascadia-code",   label: "Cascadia Code",    css: "'Cascadia Code Variable', monospace" },
  { id: "source-code-pro", label: "Source Code Pro",  css: "'Source Code Pro Variable', monospace" },
  { id: "ibm-plex-mono",   label: "IBM Plex Mono",    css: "'IBM Plex Mono', monospace" },
  { id: "inconsolata",     label: "Inconsolata",      css: "'Inconsolata Variable', monospace" },
  { id: "ubuntu-mono",     label: "Ubuntu Mono",      css: "'Ubuntu Mono', monospace" },
  { id: "menlo",           label: "Menlo",            css: "Menlo, monospace" },
  { id: "consolas",        label: "Consolas",         css: "Consolas, monospace" },
  { id: "system",          label: "System Default",   css: "monospace" },
] as const;

export type TerminalFontId = typeof TERMINAL_FONTS[number]["id"];

export function fontCss(id: TerminalFontId): string {
  return TERMINAL_FONTS.find((f) => f.id === id)?.css ?? "'JetBrains Mono Variable', monospace";
}

// ── Colour themes ─────────────────────────────────────────────────────────────

export const TERMINAL_THEMES = [
  { id: "system",          label: "Default",         bg: "#111111", fg: "#e0e0e0" },
  { id: "dracula",         label: "Dracula",         bg: "#282a36", fg: "#f8f8f2" },
  { id: "one-dark",        label: "One Dark",        bg: "#282c34", fg: "#abb2bf" },
  { id: "nord",            label: "Nord",            bg: "#2e3440", fg: "#d8dee9" },
  { id: "tokyo-night",     label: "Tokyo Night",     bg: "#1a1b2e", fg: "#c0caf5" },
  { id: "catppuccin",      label: "Catppuccin",      bg: "#1e1e2e", fg: "#cdd6f4" },
  { id: "gruvbox",         label: "Gruvbox",         bg: "#282828", fg: "#ebdbb2" },
  { id: "monokai",         label: "Monokai",         bg: "#272822", fg: "#f8f8f2" },
  { id: "solarized-dark",  label: "Solarized Dark",  bg: "#002b36", fg: "#839496" },
  { id: "solarized-light", label: "Solarized Light", bg: "#fdf6e3", fg: "#657b83" },
] as const;

export type TerminalThemeId = typeof TERMINAL_THEMES[number]["id"];

// Full xterm colour palettes for every non-system theme.
const THEME_COLORS: Record<Exclude<TerminalThemeId, "system">, ITheme> = {
  "dracula": {
    background: "#282a36", foreground: "#f8f8f2",
    cursor: "#f8f8f2", cursorAccent: "#282a36",
    selectionBackground: "#44475a88",
    black: "#21222c", red: "#ff5555", green: "#50fa7b", yellow: "#f1fa8c",
    blue: "#bd93f9", magenta: "#ff79c6", cyan: "#8be9fd", white: "#f8f8f2",
    brightBlack: "#6272a4", brightRed: "#ff6e6e", brightGreen: "#69ff94",
    brightYellow: "#ffffa5", brightBlue: "#d6acff", brightMagenta: "#ff92df",
    brightCyan: "#a4ffff", brightWhite: "#ffffff",
  },
  "one-dark": {
    background: "#282c34", foreground: "#abb2bf",
    cursor: "#528bff", cursorAccent: "#282c34",
    selectionBackground: "#3e445188",
    black: "#282c34", red: "#e06c75", green: "#98c379", yellow: "#e5c07b",
    blue: "#61afef", magenta: "#c678dd", cyan: "#56b6c2", white: "#abb2bf",
    brightBlack: "#5c6370", brightRed: "#e06c75", brightGreen: "#98c379",
    brightYellow: "#e5c07b", brightBlue: "#61afef", brightMagenta: "#c678dd",
    brightCyan: "#56b6c2", brightWhite: "#ffffff",
  },
  "nord": {
    background: "#2e3440", foreground: "#d8dee9",
    cursor: "#88c0d0", cursorAccent: "#2e3440",
    selectionBackground: "#434c5e88",
    black: "#3b4252", red: "#bf616a", green: "#a3be8c", yellow: "#ebcb8b",
    blue: "#81a1c1", magenta: "#b48ead", cyan: "#88c0d0", white: "#e5e9f0",
    brightBlack: "#4c566a", brightRed: "#bf616a", brightGreen: "#a3be8c",
    brightYellow: "#ebcb8b", brightBlue: "#81a1c1", brightMagenta: "#b48ead",
    brightCyan: "#8fbcbb", brightWhite: "#eceff4",
  },
  "tokyo-night": {
    background: "#1a1b2e", foreground: "#c0caf5",
    cursor: "#c0caf5", cursorAccent: "#1a1b2e",
    selectionBackground: "#28345788",
    black: "#15161e", red: "#f7768e", green: "#9ece6a", yellow: "#e0af68",
    blue: "#7aa2f7", magenta: "#bb9af7", cyan: "#7dcfff", white: "#a9b1d6",
    brightBlack: "#414868", brightRed: "#f7768e", brightGreen: "#9ece6a",
    brightYellow: "#e0af68", brightBlue: "#7aa2f7", brightMagenta: "#bb9af7",
    brightCyan: "#7dcfff", brightWhite: "#c0caf5",
  },
  "catppuccin": {
    background: "#1e1e2e", foreground: "#cdd6f4",
    cursor: "#f5e0dc", cursorAccent: "#1e1e2e",
    selectionBackground: "#585b7088",
    black: "#45475a", red: "#f38ba8", green: "#a6e3a1", yellow: "#f9e2af",
    blue: "#89b4fa", magenta: "#f5c2e7", cyan: "#94e2d5", white: "#bac2de",
    brightBlack: "#585b70", brightRed: "#f38ba8", brightGreen: "#a6e3a1",
    brightYellow: "#f9e2af", brightBlue: "#89b4fa", brightMagenta: "#f5c2e7",
    brightCyan: "#94e2d5", brightWhite: "#a6adc8",
  },
  "gruvbox": {
    background: "#282828", foreground: "#ebdbb2",
    cursor: "#ebdbb2", cursorAccent: "#282828",
    selectionBackground: "#3c383688",
    black: "#282828", red: "#cc241d", green: "#98971a", yellow: "#d79921",
    blue: "#458588", magenta: "#b16286", cyan: "#689d6a", white: "#a89984",
    brightBlack: "#928374", brightRed: "#fb4934", brightGreen: "#b8bb26",
    brightYellow: "#fabd2f", brightBlue: "#83a598", brightMagenta: "#d3869b",
    brightCyan: "#8ec07c", brightWhite: "#ebdbb2",
  },
  "monokai": {
    background: "#272822", foreground: "#f8f8f2",
    cursor: "#f8f8f0", cursorAccent: "#272822",
    selectionBackground: "#49483e88",
    black: "#272822", red: "#f92672", green: "#a6e22e", yellow: "#f4bf75",
    blue: "#66d9e8", magenta: "#ae81ff", cyan: "#a1efe4", white: "#f8f8f2",
    brightBlack: "#75715e", brightRed: "#f92672", brightGreen: "#a6e22e",
    brightYellow: "#f4bf75", brightBlue: "#66d9e8", brightMagenta: "#ae81ff",
    brightCyan: "#a1efe4", brightWhite: "#f9f8f5",
  },
  "solarized-dark": {
    background: "#002b36", foreground: "#839496",
    cursor: "#839496", cursorAccent: "#002b36",
    selectionBackground: "#07364288",
    black: "#073642", red: "#dc322f", green: "#859900", yellow: "#b58900",
    blue: "#268bd2", magenta: "#d33682", cyan: "#2aa198", white: "#eee8d5",
    brightBlack: "#002b36", brightRed: "#cb4b16", brightGreen: "#586e75",
    brightYellow: "#657b83", brightBlue: "#839496", brightMagenta: "#6c71c4",
    brightCyan: "#93a1a1", brightWhite: "#fdf6e3",
  },
  "solarized-light": {
    background: "#fdf6e3", foreground: "#657b83",
    cursor: "#586e75", cursorAccent: "#fdf6e3",
    selectionBackground: "#eee8d588",
    black: "#073642", red: "#dc322f", green: "#859900", yellow: "#b58900",
    blue: "#268bd2", magenta: "#d33682", cyan: "#2aa198", white: "#eee8d5",
    brightBlack: "#002b36", brightRed: "#cb4b16", brightGreen: "#586e75",
    brightYellow: "#657b83", brightBlue: "#839496", brightMagenta: "#6c71c4",
    brightCyan: "#93a1a1", brightWhite: "#fdf6e3",
  },
};

/**
 * Returns the xterm ITheme for the given terminal theme ID.
 * "system" reads from the document's current CSS custom properties.
 */
export function resolveTermTheme(id: TerminalThemeId): ITheme {
  if (id !== "system") return THEME_COLORS[id];

  const root = document.documentElement;
  const bg = getComputedStyle(root).getPropertyValue("--color-surface-1").trim() || "#111111";
  const accent = getComputedStyle(root).getPropertyValue("--color-accent").trim() || "#CDFF00";
  const accentHover = getComputedStyle(root).getPropertyValue("--color-accent-hover").trim() || accent;
  const isLight = root.dataset.theme === "light";
  return {
    background: bg,
    foreground: isLight ? "#1e1e2e" : "#e0e0e0",
    cursor: accent,
    cursorAccent: isLight ? "#ffffff" : "#000000",
    selectionBackground: `${accent}40`,
    green: accent,
    brightGreen: accentHover,
    ...(isLight && { black: "#3c3c3c", brightBlack: "#6c6c6c" }),
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface TerminalSettingsStore {
  fontSize: number;
  scrollback: number;
  copyOnSelect: boolean;
  fontFamily: TerminalFontId;
  termTheme: TerminalThemeId;
  load: () => Promise<void>;
  setFontSize: (n: number) => void;
  setScrollback: (n: number) => void;
  setCopyOnSelect: (v: boolean) => void;
  setFontFamily: (id: TerminalFontId) => void;
  setTermTheme: (id: TerminalThemeId) => void;
}

export const useTerminalSettings = create<TerminalSettingsStore>((set) => ({
  fontSize: 14,
  scrollback: 1000,
  copyOnSelect: true,
  fontFamily: "jetbrains-mono",
  termTheme: "system",

  load: async () => {
    const [fs, sb, cos, ff, tt] = await Promise.all([
      settingsCommands.getSetting("terminal_font_size"),
      settingsCommands.getSetting("terminal_scrollback"),
      settingsCommands.getSetting("terminal_copy_on_select"),
      settingsCommands.getSetting("terminal_font_family"),
      settingsCommands.getSetting("terminal_theme"),
    ]);
    set({
      fontSize: fs ? Number(fs) : 14,
      scrollback: sb ? Number(sb) : 1000,
      copyOnSelect: cos !== null ? cos === "true" : true,
      fontFamily: (ff as TerminalFontId | null) ?? "jetbrains-mono",
      termTheme: (tt as TerminalThemeId | null) ?? "system",
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

  setTermTheme: (id) => {
    set({ termTheme: id });
    void settingsCommands.setSetting("terminal_theme", id);
  },
}));
