import { useEffect } from "react";
import { settingsCommands } from "../lib/tauriCommands";
import { recordHeartbeat } from "../lib/vaultActivity";

export function useVaultHeartbeat() {
  useEffect(() => {
    let lastBeat = 0;
    const beat = () => {
      const now = Date.now();
      if (now - lastBeat > 60_000) {
        lastBeat = now;
        recordHeartbeat();
        settingsCommands.vaultHeartbeat().catch(() => {});
      }
    };
    window.addEventListener("mousemove", beat, { passive: true });
    window.addEventListener("keydown", beat, { passive: true });
    return () => {
      window.removeEventListener("mousemove", beat);
      window.removeEventListener("keydown", beat);
    };
  }, []);
}
