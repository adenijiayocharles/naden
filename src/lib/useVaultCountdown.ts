import { useEffect, useState } from "react";
import { useVaultStore } from "../store/vaultStore";
import { settingsCommands } from "./tauriCommands";
import { getLastHeartbeatMs } from "./vaultActivity";

export function useVaultCountdown() {
  const isUnlocked = useVaultStore((s) => s.isUnlocked);
  const isPasswordRequired = useVaultStore((s) => s.isPasswordRequired);
  const [timeoutMins, setTimeoutMins] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    settingsCommands.getSetting("vault_timeout_minutes")
      .then((v) => setTimeoutMins(Number(v ?? "0")))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isUnlocked || !isPasswordRequired || timeoutMins === 0) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const elapsed = Math.floor((Date.now() - getLastHeartbeatMs()) / 1000);
      setSecondsLeft(Math.max(0, timeoutMins * 60 - elapsed));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isUnlocked, isPasswordRequired, timeoutMins]);

  if (secondsLeft === null) return null;
  return {
    secondsLeft,
    urgent: secondsLeft < 60,
    warning: secondsLeft < 120,
    fmt: () => {
      const m = Math.floor(secondsLeft / 60);
      const s = secondsLeft % 60;
      return `${m}:${String(s).padStart(2, "0")}`;
    },
  };
}
