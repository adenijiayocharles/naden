import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useServerStore } from "../store/serverStore";
import { useTerminalStore } from "../store/terminalStore";
import { useSftpStore } from "../store/sftpStore";
import { useVaultStore } from "../store/vaultStore";

interface TrayConnectPayload {
  serverId: string;
  mode: "terminal" | "sftp";
}

// Vault state isn't read reactively here — tray events fire rarely, so
// reading it fresh from the store on each event avoids re-subscribing
// the listener whenever the vault locks/unlocks.
function isVaultLocked(): boolean {
  const { isSetup, isUnlocked, isPasswordRequired } = useVaultStore.getState();
  return isSetup && isPasswordRequired && !isUnlocked;
}

export function useTrayEvents() {
  const openTerminal = useTerminalStore((s) => s.openSession);
  const openSftp = useSftpStore((s) => s.openSession);

  useEffect(() => {
    const unlisten = listen<TrayConnectPayload>("tray:connect", async (event) => {
      // While the vault is locked, a tray connect click would open a terminal
      // or SFTP session behind the lock screen, which then appears unexpectedly
      // once unlocked — same reasoning as `useMenuEvents`'s `whenUnlocked`.
      if (isVaultLocked()) return;
      const { serverId, mode } = event.payload;
      const server = useServerStore.getState().servers.find((s) => s.id === serverId);
      if (!server) return;
      if (mode === "terminal") {
        await openTerminal(server.id, server.displayName);
      } else {
        await openSftp(server.id, server.displayName);
      }
    });
    return () => { void unlisten.then((fn) => fn()); };
  }, [openTerminal, openSftp]);
}
