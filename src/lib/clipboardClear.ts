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

import { clipboardCommands } from "./commands/local";
import { getCurrentWindow } from "@tauri-apps/api/window";

// NOTE: Force-kill (SIGKILL) cannot be caught — the 30-second timer is the
// only protection in that case. This handler covers graceful close only.
let closeHandlerRegistered = false;

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

  if (!closeHandlerRegistered) {
    closeHandlerRegistered = true;
    void getCurrentWindow().onCloseRequested(() => {
      activeClear?.clearNow();
    });
  }
}

/// Starts the auto-clear countdown and notifies banner subscribers without
/// writing to the clipboard — for use after a Rust-side copy where plaintext
/// must never cross the IPC bridge.
export function activateAutoClear(): void {
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

  if (!closeHandlerRegistered) {
    closeHandlerRegistered = true;
    void getCurrentWindow().onCloseRequested(() => {
      activeClear?.clearNow();
    });
  }
}

export function getActiveClear(): ActiveClear | null {
  return activeClear;
}

export function subscribeClipboardClear(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
