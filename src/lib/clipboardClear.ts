const CLEAR_DELAY_MS = 30_000;

interface ActiveClear {
  expiresAt: number;
  clearNow: () => void;
}

let activeClear: ActiveClear | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

import { clipboardCommands } from "./tauriCommands";

export function copyWithAutoClear(text: string): void {
  void clipboardCommands.writeText(text);

  if (clearTimer !== null) clearTimeout(clearTimer);

  const clear = () => {
    void clipboardCommands.writeText("");
    activeClear = null;
    clearTimer = null;
    notify();
  };

  clearTimer = setTimeout(clear, CLEAR_DELAY_MS);
  activeClear = { expiresAt: Date.now() + CLEAR_DELAY_MS, clearNow: clear };
  notify();
}

export function getActiveClear(): ActiveClear | null {
  return activeClear;
}

export function subscribeClipboardClear(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
