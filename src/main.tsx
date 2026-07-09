import React from "react";
import ReactDOM from "react-dom/client";
import { initSentry } from "./lib/sentryClient";
import App from "./App";
import "./index.css";
initSentry();
import "@xterm/xterm/css/xterm.css";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/fira-code";
import "@fontsource-variable/cascadia-code";
import "@fontsource-variable/source-code-pro";
import "@fontsource/ibm-plex-mono";
import "@fontsource-variable/inconsolata";
import "@fontsource/ubuntu-mono";
// UI (non-terminal) fonts default to "system" and are otherwise a single
// user choice — lazily imported by ensureUiFontLoaded() in uiFontSettings.ts
// instead of bundled here, so app startup doesn't parse/register all of them.
// Kick off ArrayBuffer-based font loading before any terminal renders.
// See src/lib/canvasFonts.ts for why URL-based FontFace is insufficient in WKWebView.
import "./lib/canvasFonts";

document.addEventListener("contextmenu", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
