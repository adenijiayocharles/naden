import { useCallback, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { useUiStore } from "../store/uiStore";
import { useVaultStore } from "../store/vaultStore";
import { updaterCommands } from "../lib/tauriCommands";
import { formatError } from "../lib/errors";

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

  const checkForUpdates = useCallback(async () => {
    try {
      const update = await updaterCommands.checkForUpdate();
      if (!update) {
        await message("You're on the latest version.", { title: "SSHelter", kind: "info" });
        return;
      }
      const shouldInstall = await ask(
        `Version ${update.version} is available. Download and install now?`,
        { title: "Update Available", kind: "info" },
      );
      if (!shouldInstall) return;

      await update.download();
      const shouldRestart = await ask(
        "Update installed. Restart SSHelter now to apply it?",
        { title: "Update Ready", kind: "info" },
      );
      if (shouldRestart) await updaterCommands.relaunch();
    } catch (e) {
      await message(formatError(e), { title: "Update Check Failed", kind: "error" });
    }
  }, []);

  useEffect(() => {
    const unlisteners = [
      listen("menu:new_connection", () => openAdd()),
      listen("menu:import_ssh_config", () => openImportSshConfig()),
      listen("menu:lock_vault", () => void lockVault()),
      listen("menu:settings", () => openSettings()),
      listen("menu:check_for_updates", () => void checkForUpdates()),
      listen("menu:show_logs", () => openLogs()),
      listen("menu:show_snippets", () => openSnippets()),
      listen("menu:show_playbooks", () => openPlaybooks()),
      listen("menu:show_tunnels", () => openTunnels()),
      listen("menu:show_keys", () => openKeys()),
      listen("menu:toggle_sidebar", () => toggleSidebar()),
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
    checkForUpdates,
  ]);
}
