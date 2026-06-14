import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Intercepts every `*.woff2?url` JS/TS import during the production build and
// returns a base64 data URI instead of a /assets/... URL.  The font bytes are
// then embedded directly in the JS bundle, so WKWebView production builds can
// create FontFace objects without ANY network request to tauri://localhost —
// eliminating silent font-load failures caused by the custom URL scheme.
//
// CSS url() references are handled separately by Vite (assetsInlineLimit below)
// and are NOT intercepted here, so @font-face in CSS stays as external files.
function inlineFontsPlugin(): Plugin {
  const VIRTUAL_PREFIX = "\0woff2-data:";

  return {
    name: "inline-woff2-as-data-uri",
    enforce: "pre",
    apply: "build", // only in production builds; dev uses /assets/... URLs via fetch()

    async resolveId(source, importer, options) {
      // Only intercept explicit ?url imports of woff2 files (canvasFonts.ts)
      if (!/\.woff2\?url$/.test(source)) return;

      // Resolve the real file path without the ?url query
      const resolved = await this.resolve(
        source.replace(/\?url$/, ""),
        importer,
        { skipSelf: true, ...options },
      );
      if (!resolved || resolved.external) return;

      return VIRTUAL_PREFIX + resolved.id;
    },

    load(id) {
      if (!id.startsWith(VIRTUAL_PREFIX)) return;
      const filePath = id.slice(VIRTUAL_PREFIX.length);
      const b64 = readFileSync(filePath).toString("base64");
      return `export default "data:font/woff2;base64,${b64}"`;
    },
  };
}

export default defineConfig({
  plugins: [inlineFontsPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target:
      process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    esbuildOptions: {
      drop: process.env.TAURI_ENV_DEBUG ? [] : ["console", "debugger"],
    },
    // CSS @font-face url() references: keep fonts as external files (limit 0)
    // to avoid inlining the full @fontsource subset fonts (~800 KB total).
    // The canvasFonts.ts ?url imports are handled above by inlineFontsPlugin.
    assetsInlineLimit: (filePath) =>
      /\.(woff2?|ttf|otf|eot)$/.test(filePath) ? 0 : 4096,
  },
});
