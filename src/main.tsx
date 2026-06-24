import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "@xterm/xterm/css/xterm.css";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/fira-code";
import "@fontsource-variable/cascadia-code";
import "@fontsource-variable/source-code-pro";
import "@fontsource/ibm-plex-mono";
import "@fontsource-variable/inconsolata";
import "@fontsource/ubuntu-mono";
import "@fontsource-variable/geist";
import "@fontsource-variable/manrope";
import "@fontsource-variable/inter";
import "@fontsource-variable/work-sans";
import "@fontsource-variable/outfit";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/lexend";
// Kick off ArrayBuffer-based font loading before any terminal renders.
// See src/lib/canvasFonts.ts for why URL-based FontFace is insufficient in WKWebView.
import "./lib/canvasFonts";

document.addEventListener("contextmenu", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
