import { useEffect, useCallback } from "react";
import { useUiStore } from "../store/uiStore";

export function useKeyboardShortcuts() {
  const openAdd = useUiStore((s) => s.openAdd);
  const openSettings = useUiStore((s) => s.openSettings);
  const openPalette = useUiStore((s) => s.openPalette);

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
      }
    },
    [openAdd, openSettings, openPalette],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
