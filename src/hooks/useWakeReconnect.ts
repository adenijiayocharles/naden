import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTerminalStore } from "../store/terminalStore";
import { useSftpStore } from "../store/sftpStore";

export function useWakeReconnect() {
  const wakeRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeRetryCount = useRef(0);

  useEffect(() => {
    const reconnectErrored = () => {
      const { sessions: tSessions, reconnectSession: tReconnect } = useTerminalStore.getState();
      const { sessions: sSessions, reconnectSession: sReconnect } = useSftpStore.getState();
      let any = false;
      for (const s of tSessions) {
        if (s.status === "error") { void tReconnect(s.id); any = true; }
      }
      for (const s of sSessions) {
        if (s.status === "error") { void sReconnect(s.id); any = true; }
      }
      return any;
    };

    const scheduleRetry = () => {
      if (wakeRetryCount.current >= 3) return;
      // 12 s > 10 s TCP timeout, so any "connecting" session from the last
      // attempt will have resolved to "error" by the time this fires.
      wakeRetryTimer.current = setTimeout(() => {
        wakeRetryCount.current++;
        if (reconnectErrored()) scheduleRetry();
      }, 12_000);
    };

    const unlisten = listen("system:wake", () => {
      if (wakeRetryTimer.current) clearTimeout(wakeRetryTimer.current);
      wakeRetryCount.current = 0;

      const { sessions: tSessions, reconnectSession: tReconnect } = useTerminalStore.getState();
      const { sessions: sSessions, reconnectSession: sReconnect } = useSftpStore.getState();

      // Reconnect every session — "connecting" covers tabs that were mid-
      // handshake when the machine slept and are now stuck forever.
      for (const s of tSessions) {
        if (s.status !== "disconnected") void tReconnect(s.id);
      }
      for (const s of sSessions) void sReconnect(s.id);

      scheduleRetry();
    });

    return () => {
      if (wakeRetryTimer.current) clearTimeout(wakeRetryTimer.current);
      void unlisten.then((fn) => fn());
    };
  }, []);
}
