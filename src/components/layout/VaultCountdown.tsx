import { useEffect, useState } from "react";
import { useVaultStore } from "../../store/vaultStore";
import { settingsCommands } from "../../lib/tauriCommands";
import { getLastHeartbeatMs } from "../../lib/vaultActivity";

function fmt(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function VaultCountdown() {
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

  const urgent = secondsLeft < 60;
  const warning = secondsLeft < 120;

  return (
    <div className={`mx-2 mb-2 px-3 py-2 rounded-lg border text-xs flex items-center gap-2 ${
      urgent
        ? "bg-red-950/30 border-red-900/40 text-red-400"
        : warning
          ? "bg-yellow-950/30 border-yellow-900/40 text-yellow-400"
          : "bg-[#0d0d0d] border-[#1e1e1e] text-[#555]"
    }`}>
      <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
        <rect x="5" y="1" width="6" height="3" rx="1" />
        <path strokeLinecap="round" d="M3 5.5A2.5 2.5 0 015.5 3h5A2.5 2.5 0 0113 5.5v7A2.5 2.5 0 0110.5 15h-5A2.5 2.5 0 013 12.5v-7z" />
        <path strokeLinecap="round" d="M8 7v3" />
      </svg>
      <span>Locks in <span className="font-mono font-semibold">{fmt(secondsLeft)}</span></span>
    </div>
  );
}
