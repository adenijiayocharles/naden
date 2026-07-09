import { create } from "zustand";
import { settingsCommands } from "./commands/settings";

export const UI_FONTS = [
  {
    id: "system",
    label: "System Default",
    css: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif',
  },
  { id: "inter", label: "Inter", css: "'Inter Variable', sans-serif" },
  { id: "geist", label: "Geist", css: "'Geist Variable', sans-serif" },
  { id: "manrope", label: "Manrope", css: "'Manrope Variable', sans-serif" },
  { id: "work-sans", label: "Work Sans", css: "'Work Sans Variable', sans-serif" },
  { id: "outfit", label: "Outfit", css: "'Outfit Variable', sans-serif" },
  { id: "space-grotesk", label: "Space Grotesk", css: "'Space Grotesk Variable', sans-serif" },
  { id: "plus-jakarta-sans", label: "Plus Jakarta Sans", css: "'Plus Jakarta Sans Variable', sans-serif" },
  { id: "dm-sans", label: "DM Sans", css: "'DM Sans Variable', sans-serif" },
  { id: "lexend", label: "Lexend", css: "'Lexend Variable', sans-serif" },
] as const;

export type UiFontId = typeof UI_FONTS[number]["id"];

export function uiFontCss(id: UiFontId): string {
  return UI_FONTS.find((f) => f.id === id)?.css ?? UI_FONTS[0].css;
}

// "system" needs no webfont file. Every other UI font ships as a separate
// @fontsource-variable package — dynamically imported here instead of
// eagerly in main.tsx, since only one is ever active per user and most
// never leave the "system" default.
const UI_FONT_MODULES: Partial<Record<UiFontId, () => Promise<unknown>>> = {
  inter: () => import("@fontsource-variable/inter"),
  geist: () => import("@fontsource-variable/geist"),
  manrope: () => import("@fontsource-variable/manrope"),
  "work-sans": () => import("@fontsource-variable/work-sans"),
  outfit: () => import("@fontsource-variable/outfit"),
  "space-grotesk": () => import("@fontsource-variable/space-grotesk"),
  "plus-jakarta-sans": () => import("@fontsource-variable/plus-jakarta-sans"),
  "dm-sans": () => import("@fontsource-variable/dm-sans"),
  lexend: () => import("@fontsource-variable/lexend"),
};

const loadedUiFonts = new Set<UiFontId>();

export function ensureUiFontLoaded(id: UiFontId): Promise<unknown> {
  if (loadedUiFonts.has(id)) return Promise.resolve();
  const load = UI_FONT_MODULES[id];
  if (!load) return Promise.resolve();
  loadedUiFonts.add(id);
  return load();
}

export const UI_FONT_SIZE_MIN = 12;
export const UI_FONT_SIZE_MAX = 20;
export const UI_FONT_SIZES = Array.from(
  { length: UI_FONT_SIZE_MAX - UI_FONT_SIZE_MIN + 1 },
  (_, i) => UI_FONT_SIZE_MIN + i,
);
const DEFAULT_UI_FONT_SIZE = 14;

// Mirrors the --color-accent override pattern (see useAppInit.ts /
// SettingsPage.tsx): an inline style on <html> beats the stylesheet rule
// regardless of cascade order. --font-sans is the single source every
// element's font-family inherits from (set on <html>, consumed by every
// other element via normal CSS inheritance) so this is the only place that
// needs to change for the chosen font to reach the whole app. Kept out of
// the store below so the store stays DOM-free and unit-testable under the
// "node" vitest environment; callers apply it explicitly after
// load()/setFontFamily()/setFontSize().
export function applyUiFont(fontFamily: UiFontId, fontSize: number) {
  const root = document.documentElement;
  root.style.setProperty("--font-sans", uiFontCss(fontFamily));
  root.style.fontSize = `${fontSize}px`;
}

interface UiFontSettingsStore {
  fontFamily: UiFontId;
  fontSize: number;
  load: () => Promise<void>;
  setFontFamily: (id: UiFontId) => void;
  setFontSize: (n: number) => void;
}

export const useUiFontSettings = create<UiFontSettingsStore>((set) => ({
  fontFamily: "system",
  fontSize: DEFAULT_UI_FONT_SIZE,

  load: async () => {
    const [ff, fs] = await Promise.all([
      settingsCommands.getSetting("ui_font_family"),
      settingsCommands.getSetting("ui_font_size"),
    ]);
    const fontFamily = (ff as UiFontId | null) ?? "system";
    await ensureUiFontLoaded(fontFamily);
    set({
      fontFamily,
      fontSize: fs ? Number(fs) : DEFAULT_UI_FONT_SIZE,
    });
  },

  setFontFamily: (id) => {
    set({ fontFamily: id });
    void ensureUiFontLoaded(id);
    void settingsCommands.setSetting("ui_font_family", id);
  },

  setFontSize: (n) => {
    set({ fontSize: n });
    void settingsCommands.setSetting("ui_font_size", String(n));
  },
}));
