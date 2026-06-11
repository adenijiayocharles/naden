import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useUiStore } from "../store/uiStore";
import { useVaultStore } from "../store/vaultStore";

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
    const unlisteners = [
      listen("menu:new_connection", () => openAdd()),
      listen("menu:import_ssh_config", () => openImportSshConfig()),
      listen("menu:lock_vault", () => void lockVault()),
      listen("menu:settings", () => openSettings()),
      listen("menu:check_for_updates", () => openSettings("about")),
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
  ]);
}
