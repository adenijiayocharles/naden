import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useUiStore } from "../store/uiStore";

export function useMenuEvents() {
  const openAdd = useUiStore((s) => s.openAdd);
  const openLogs = useUiStore((s) => s.openLogs);
  const openSettings = useUiStore((s) => s.openSettings);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const openImportSshConfig = useUiStore((s) => s.openImportSshConfig);

  useEffect(() => {
    const unlisteners = [
      listen("menu:new_connection", () => openAdd()),
      listen("menu:import_ssh_config", () => openImportSshConfig()),
      listen("menu:settings", () => openSettings()),
      listen("menu:show_logs", () => openLogs()),
      listen("menu:toggle_sidebar", () => toggleSidebar()),
    ];
    return () => {
      unlisteners.forEach((p) => void p.then((fn) => fn()));
    };
  }, [openAdd, openImportSshConfig, openSettings, openLogs, toggleSidebar]);
}
