const FILE_ICON = `<svg width="13" height="13" fill="#a0a0b0" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/></svg>`;
const MULTI_ICON = `<svg width="13" height="13" fill="#a0a0b0" viewBox="0 0 20 20"><path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z"/></svg>`;

export function setDragImage(e: DragEvent | React.DragEvent, name: string, count: number) {
  const multi = count > 1;
  const label = multi ? `${count} files` : name;

  const el = document.createElement("div");
  el.style.cssText = [
    "position:fixed", "left:-9999px", "top:-9999px",
    "display:flex", "align-items:center", "gap:6px",
    "padding:5px 10px",
    "background:#1c1c28", "border:1px solid rgba(255,255,255,0.12)",
    "border-radius:6px", "color:#d4d4e0",
    "font:12px/1 ui-monospace,monospace",
    "white-space:nowrap", "pointer-events:none",
    "box-shadow:0 4px 12px rgba(0,0,0,0.5)",
  ].join(";");
  const icon = document.createElement("span");
  icon.setAttribute("aria-hidden", "true");
  // SVG literals are hardcoded constants — not user-controlled.
  icon.innerHTML = multi ? MULTI_ICON : FILE_ICON;
  const text = document.createElement("span");
  text.textContent = label;
  el.appendChild(icon);
  el.appendChild(text);
  document.body.appendChild(el);

  e.dataTransfer?.setDragImage(el, -12, -12);
  setTimeout(() => el.remove(), 0);
}
