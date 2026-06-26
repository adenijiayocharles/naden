import { useEffect, useCallback } from "react";
import { useUiStore } from "../store/uiStore";
import { useTerminalStore } from "../store/terminalStore";
import { useTerminalToolsStore } from "../store/terminalToolsStore";

interface Options {
  onNewTab?: () => void;
}

export function useKeyboardShortcuts({ onNewTab }: Options = {}) {
  const openAdd = useUiStore((s) => s.openAdd);
  const openSettings = useUiStore((s) => s.openSettings);
  const openPalette = useUiStore((s) => s.openPalette);
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const closeSession = useTerminalStore((s) => s.closeSession);
  const toggleTool = useTerminalToolsStore((s) => s.toggleTool);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      switch (e.key) {
        case "k":
          e.preventDefault();
          openPalette();
          break;
        case "n":
          e.preventDefault();
          openAdd();
          break;
        case ",":
          e.preventDefault();
          openSettings();
          break;
        case "t":
          e.preventDefault();
          onNewTab?.();
          break;
        case "w":
          e.preventDefault();
          if (activeSessionId) void closeSession(activeSessionId);
          break;
        case "s":
          e.preventDefault();
          if (activeSessionId) toggleTool("snippets");
          break;
      }
    },
    [openAdd, openSettings, openPalette, onNewTab, activeSessionId, closeSession, toggleTool],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
