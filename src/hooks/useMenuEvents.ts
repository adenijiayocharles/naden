import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useUiStore } from "../store/uiStore";
import { useVaultStore } from "../store/vaultStore";

// Vault state isn't read reactively here — menu events fire rarely, so
// reading it fresh from the store on each event avoids re-subscribing
// the listeners whenever the vault locks/unlocks.
function isVaultLocked(): boolean {
  const { isSetup, isUnlocked, isPasswordRequired } = useVaultStore.getState();
  return isSetup && isPasswordRequired && !isUnlocked;
}

export function useMenuEvents() {
  const openAdd = useUiStore((s) => s.openAdd);
  const openLogs = useUiStore((s) => s.openLogs);
  const openSnippets = useUiStore((s) => s.openSnippets);
  const openPlaybooks = useUiStore((s) => s.openPlaybooks);
  const openTunnels = useUiStore((s) => s.openTunnels);
  const openKeys = useUiStore((s) => s.openKeys);
  const openSettings = useUiStore((s) => s.openSettings);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const openImportSshConfig = useUiStore((s) => s.openImportSshConfig);
  const lockVault = useVaultStore((s) => s.lock);

  useEffect(() => {
    // While the vault is locked, only "Lock Vault" should do anything —
    // every other menu action would open a modal or panel behind the
    // lock screen, which then appears unexpectedly once unlocked.
    const whenUnlocked = (fn: () => void) => () => {
      if (!isVaultLocked()) fn();
    };

    const unlisteners = [
      listen("menu:new_connection", whenUnlocked(() => openAdd())),
      listen("menu:import_ssh_config", whenUnlocked(() => openImportSshConfig())),
      listen("menu:lock_vault", () => void lockVault()),
      listen("menu:settings", whenUnlocked(() => openSettings())),
      listen("menu:show_logs", whenUnlocked(() => openLogs())),
      listen("menu:show_snippets", whenUnlocked(() => openSnippets())),
      listen("menu:show_playbooks", whenUnlocked(() => openPlaybooks())),
      listen("menu:show_tunnels", whenUnlocked(() => openTunnels())),
      listen("menu:show_keys", whenUnlocked(() => openKeys())),
      listen("menu:toggle_sidebar", whenUnlocked(() => toggleSidebar())),
    ];
    return () => {
      unlisteners.forEach((p) => void p.then((fn) => fn()));
    };
  }, [
    openAdd,
    openImportSshConfig,
    lockVault,
    openSettings,
    openLogs,
    openSnippets,
    openPlaybooks,
    openTunnels,
    openKeys,
    toggleSidebar,
  ]);
}
