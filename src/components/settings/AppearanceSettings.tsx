import { useState, useEffect, useRef } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { useUiFontSettings, UI_FONTS, UI_FONT_SIZES, uiFontCss, applyUiFont } from "../../lib/uiFontSettings";
import { settingsCommands } from "../../lib/tauriCommands";
import { shiftLightness } from "../../lib/accentColor";
import { SectionHeader, Row } from "./SettingsShared";

const ACCENTS = [
  { id: "lime",   base: "#CDFF00", hover: "#d8ff33", dim: "#a8cc00" },
  { id: "green",  base: "#00e676", hover: "#33eb91", dim: "#00b85e" },
  { id: "cyan",   base: "#00d4ff", hover: "#33ddff", dim: "#00a8cc" },
  { id: "blue",   base: "#4f8ef7", hover: "#7aaeff", dim: "#3a6bc4" },
  { id: "purple", base: "#a78bfa", hover: "#c4b0ff", dim: "#7c5ccc" },
  { id: "orange", base: "#ff8c42", hover: "#ffa566", dim: "#cc6f35" },
  { id: "pink",   base: "#f472b6", hover: "#f9a8d4", dim: "#c4588c" },
  { id: "red",    base: "#ff5555", hover: "#ff7777", dim: "#cc4444" },
  { id: "white",  base: "#ffffff", hover: "#eeeeee", dim: "#cccccc" },
] as const;
type AccentId = typeof ACCENTS[number]["id"];

type Theme = "dark" | "oled" | "dim" | "light";

interface AppearanceSettingsProps {
  initialSettings: Record<string, string>;
  flashSaved: () => void;
}

export default function AppearanceSettings({ initialSettings, flashSaved }: AppearanceSettingsProps) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [accentId, setAccentId] = useState<AccentId | "custom">("lime");
  const [customHex, setCustomHex] = useState("#ffffff");
  const colorInputRef = useRef<HTMLInputElement>(null);
  const customAccentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { fontFamily: uiFontFamily, fontSize: uiFontSize, setFontFamily: setUiFontFamily, setFontSize: setUiFontSize } =
    useUiFontSettings();

  useEffect(() => {
    if (initialSettings.theme) setTheme(initialSettings.theme as Theme);
    if (initialSettings.accent) {
      if (initialSettings.accent === "custom") {
        setAccentId("custom");
        if (initialSettings.accent_custom_color) {
          setCustomHex(initialSettings.accent_custom_color);
          const root = document.documentElement;
          root.style.setProperty("--color-accent", initialSettings.accent_custom_color);
          root.style.setProperty("--color-accent-hover", shiftLightness(initialSettings.accent_custom_color, 15));
          root.style.setProperty("--color-accent-dim", shiftLightness(initialSettings.accent_custom_color, -20));
        }
      } else {
        setAccentId(initialSettings.accent as AccentId);
      }
    }
  }, [initialSettings]);

  const saveTheme = (t: Theme) => {
    setTheme(t);
    document.documentElement.dataset.theme = t === "dark" ? "" : t;
    settingsCommands.setSetting("theme", t).catch(() => {});
    flashSaved();
  };

  const saveAccent = (id: AccentId) => {
    const a = ACCENTS.find((x) => x.id === id)!;
    setAccentId(id);
    const root = document.documentElement;
    root.style.setProperty("--color-accent", a.base);
    root.style.setProperty("--color-accent-hover", a.hover);
    root.style.setProperty("--color-accent-dim", a.dim);
    settingsCommands.setSetting("accent", id).catch(() => {});
    flashSaved();
  };

  const saveCustomAccent = (hex: string) => {
    setCustomHex(hex);
    setAccentId("custom");
    const root = document.documentElement;
    root.style.setProperty("--color-accent", hex);
    root.style.setProperty("--color-accent-hover", shiftLightness(hex, 15));
    root.style.setProperty("--color-accent-dim", shiftLightness(hex, -20));
    if (customAccentTimerRef.current) clearTimeout(customAccentTimerRef.current);
    customAccentTimerRef.current = setTimeout(() => {
      settingsCommands.setSetting("accent", "custom").catch(() => {});
      settingsCommands.setSetting("accent_custom_color", hex).catch(() => {});
      flashSaved();
    }, 150);
  };

  return (
    <div>
      <SectionHeader title="Appearance" />

      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Theme</p>
      <div className="flex gap-2 mb-6">
        {([
          { id: "dark",  label: "Dark",  surfaces: ["#000", "#0d0d0d", "#111", "#1a1a1a"] },
          { id: "oled",  label: "OLED",  surfaces: ["#000", "#000",    "#090909", "#111"] },
          { id: "dim",   label: "Dim",   surfaces: ["#1a1b1e", "#1e2023", "#25272b", "#34373d"] },
          { id: "light", label: "Light", surfaces: ["#e8e8eb", "#f0f0f2", "#ffffff", "#f8f8fa"] },
        ] as const).map(({ id, label, surfaces }) => (
          <button
            key={id}
            onClick={() => saveTheme(id)}
            className={`flex-1 rounded-lg border p-3 transition-colors text-left ${
              theme === id ? "border-accent bg-accent/5" : "border-stroke hover:border-stroke"
            }`}
          >
            <div className="flex gap-1 mb-2.5 rounded overflow-hidden" style={{ height: 36 }}>
              <div className="w-1/4 shrink-0 rounded-l" style={{ backgroundColor: surfaces[0] }} />
              <div className="flex-1 flex flex-col gap-1 p-1 rounded-r" style={{ backgroundColor: surfaces[1] }}>
                <div className="rounded-sm h-1.5" style={{ backgroundColor: surfaces[2], width: "70%" }} />
                <div className="rounded-sm h-1.5" style={{ backgroundColor: surfaces[2], width: "50%" }} />
              </div>
            </div>
            <p className={`text-xs font-medium ${theme === id ? "text-accent-fg" : "text-secondary"}`}>{label}</p>
          </button>
        ))}
      </div>

      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Accent colour</p>
      <div className="flex gap-2 flex-wrap items-center">
        {ACCENTS.map(({ id, base }) => (
          <button
            key={id}
            onClick={() => saveAccent(id)}
            title={id.charAt(0).toUpperCase() + id.slice(1)}
            className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${
              accentId === id ? "ring-2 ring-white/50 scale-110" : ""
            }`}
            style={{ backgroundColor: base }}
          />
        ))}
        <button
          onClick={() => colorInputRef.current?.click()}
          title="Custom colour"
          className={`w-7 h-7 rounded-full transition-transform hover:scale-110 flex items-center justify-center border border-stroke ${
            accentId === "custom" ? "ring-2 ring-white/50 scale-110" : ""
          }`}
          style={accentId === "custom" ? { backgroundColor: customHex } : {}}
        >
          {accentId !== "custom" && (
            <svg className="w-3.5 h-3.5 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
              <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
              <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
              <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
            </svg>
          )}
        </button>
        <input
          ref={colorInputRef}
          type="color"
          value={customHex}
          onChange={(e) => saveCustomAccent(e.target.value)}
          className="sr-only"
          aria-label="Custom accent colour"
        />
      </div>

      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 mt-6">Typography</p>
      <Row>
        <div className="min-w-0 mr-6">
          <p className="text-sm text-white font-medium">App font</p>
          <p className="text-meta text-muted mt-0.5 truncate" style={{ fontFamily: uiFontCss(uiFontFamily) }}>the quick brown fox</p>
        </div>
        <Select
          value={uiFontFamily}
          onValueChange={(value) => {
            const id = value as typeof uiFontFamily;
            setUiFontFamily(id);
            applyUiFont(id, uiFontSize);
            flashSaved();
          }}
        >
          <SelectTrigger className="h-10 shrink-0">
            <SelectValue>
              {(val) => UI_FONTS.find((f) => f.id === val)?.label ?? String(val)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {UI_FONTS.map(({ id, label }) => (
              <SelectItem key={id} value={id} label={label}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row>
        <div className="min-w-0 mr-6">
          <p className="text-sm text-white font-medium">App font size</p>
        </div>
        <Select
          value={String(uiFontSize)}
          onValueChange={(value) => {
            const n = Number(value);
            setUiFontSize(n);
            applyUiFont(uiFontFamily, n);
            flashSaved();
          }}
        >
          <SelectTrigger className="h-10 shrink-0">
            <SelectValue>{(val) => `${val}px`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {UI_FONT_SIZES.map((n) => (
              <SelectItem key={n} value={String(n)} label={`${n}px`}>{n}px</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
    </div>
  );
}
