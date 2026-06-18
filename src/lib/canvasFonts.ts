// Each ?url import is intercepted by the inlineFontsPlugin in vite.config.ts
// and returned as a base64 data URI embedded in the JS bundle.  At runtime
// there is no fetch() call and no dependence on the tauri:// URL scheme —
// the font bytes are already in memory.
import jetbrainsMonoUrl from "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url";
import firaCodeUrl from "@fontsource-variable/fira-code/files/fira-code-latin-wght-normal.woff2?url";
import cascadiaCodeUrl from "@fontsource-variable/cascadia-code/files/cascadia-code-latin-wght-normal.woff2?url";
import sourceCodeProUrl from "@fontsource-variable/source-code-pro/files/source-code-pro-latin-wght-normal.woff2?url";
import ibmPlexMono400Url from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?url";
import ibmPlexMono700Url from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-700-normal.woff2?url";
import inconsolataUrl from "@fontsource-variable/inconsolata/files/inconsolata-latin-wght-normal.woff2?url";
import ubuntuMono400Url from "@fontsource/ubuntu-mono/files/ubuntu-mono-latin-400-normal.woff2?url";
import ubuntuMono700Url from "@fontsource/ubuntu-mono/files/ubuntu-mono-latin-700-normal.woff2?url";

type FontDef = { family: string; url: string; weight: string };

// Family names MUST match the font-family declared in the @fontsource-variable CSS
// (e.g. "JetBrains Mono Variable") so Canvas2D resolves them against the correct
// entry in document.fonts when measuring character widths.
const FONT_DEFS: Record<string, FontDef[]> = {
  "jetbrains-mono": [{ family: "JetBrains Mono Variable", url: jetbrainsMonoUrl, weight: "100 800" }],
  "fira-code":       [{ family: "Fira Code Variable",      url: firaCodeUrl,      weight: "300 700" }],
  "cascadia-code":   [{ family: "Cascadia Code Variable",  url: cascadiaCodeUrl,  weight: "200 700" }],
  "source-code-pro": [{ family: "Source Code Pro Variable", url: sourceCodeProUrl, weight: "200 900" }],
  "ibm-plex-mono":   [
    { family: "IBM Plex Mono", url: ibmPlexMono400Url, weight: "400" },
    { family: "IBM Plex Mono", url: ibmPlexMono700Url, weight: "700" },
  ],
  "inconsolata":  [{ family: "Inconsolata Variable", url: inconsolataUrl,  weight: "200 900" }],
  "ubuntu-mono":  [
    { family: "Ubuntu Mono", url: ubuntuMono400Url, weight: "400" },
    { family: "Ubuntu Mono", url: ubuntuMono700Url, weight: "700" },
  ],
};

// fetch() natively handles both "data:" URIs and regular "/assets/..." URLs,
// making the old char-by-char atob decode loop unnecessary.
async function loadFont({ family, url, weight }: FontDef): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    const face = new FontFace(family, buffer, { weight, style: "normal" });
    await face.load();
    document.fonts.add(face);
  } catch (e) {
    console.warn(`[font-loader] failed: ${family}`, e);
  }
}

const resolved = Promise.resolve();
const fontPromises = new Map<string, Promise<void>>([
  ["menlo", resolved],
  ["consolas", resolved],
  ["system", resolved],
]);

export function ensureCanvasFonts(): Promise<void> {
  return ensureFont("jetbrains-mono");
}

export function ensureFont(id: string): Promise<void> {
  const cached = fontPromises.get(id);
  if (cached) return cached;
  const defs = FONT_DEFS[id];
  if (!defs) return resolved;
  const p = Promise.all(defs.map(loadFont)).then(() => {});
  fontPromises.set(id, p);
  return p;
}
