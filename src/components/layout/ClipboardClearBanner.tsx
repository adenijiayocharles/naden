import { useEffect, useState } from "react";
import { getActiveClear, subscribeClipboardClear } from "../../lib/clipboardClear";

export default function ClipboardClearBanner() {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [clearNow, setClearNow] = useState<(() => void) | null>(null);

  useEffect(() => {
    const sync = () => {
      const active = getActiveClear();
      if (active) {
        setClearNow(() => active.clearNow);
      } else {
        setSecondsLeft(null);
        setClearNow(null);
      }
    };

    const unsub = subscribeClipboardClear(sync);
    sync();
    return unsub;
  }, []);

  // Tick every second while active
  useEffect(() => {
    if (!clearNow) return;
    const tick = () => {
      const active = getActiveClear();
      if (!active) { setSecondsLeft(null); return; }
      setSecondsLeft(Math.max(0, Math.ceil((active.expiresAt - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [clearNow]);

  if (secondsLeft === null) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 bg-surface-3 border border-stroke rounded-lg shadow-2xl px-4 py-2.5 text-xs text-muted">
      <svg className="w-3.5 h-3.5 shrink-0 text-faint" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
        <rect x="3" y="1" width="10" height="14" rx="1.5" />
        <path strokeLinecap="round" d="M6 1v2h4V1" />
      </svg>
      <span>
        Clipboard clears in{" "}
        <span className="font-mono font-semibold text-white">{secondsLeft}s</span>
      </span>
      <button
        onClick={() => clearNow?.()}
        className="text-faint hover:text-white transition-colors ml-1"
        aria-label="Clear clipboard now"
      >
        Clear now
      </button>
      <button
        onClick={() => clearNow?.()}
        className="text-dim hover:text-white transition-colors text-base leading-none"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
