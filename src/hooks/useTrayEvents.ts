import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useServerStore } from "../store/serverStore";
import { useTerminalStore } from "../store/terminalStore";
import { useSftpStore } from "../store/sftpStore";

interface TrayConnectPayload {
  serverId: string;
  mode: "terminal" | "sftp";
}

export function useTrayEvents() {
  const servers = useServerStore((s) => s.servers);
  const openTerminal = useTerminalStore((s) => s.openSession);
  const openSftp = useSftpStore((s) => s.openSession);

  useEffect(() => {
    const unlisten = listen<TrayConnectPayload>("tray:connect", async (event) => {
      const { serverId, mode } = event.payload;
      const server = servers.find((s) => s.id === serverId);
      if (!server) return;
      if (mode === "terminal") {
        await openTerminal(server.id, server.displayName);
      } else {
        await openSftp(server.id, server.displayName);
      }
    });
    return () => { void unlisten.then((fn) => fn()); };
  }, [servers, openTerminal, openSftp]);
}
