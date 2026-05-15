import { useEffect, useCallback } from "react";
import { useUiStore } from "../store/uiStore";

export function useKeyboardShortcuts() {
  const openAdd = useUiStore((s) => s.openAdd);
  const openSettings = useUiStore((s) => s.openSettings);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      switch (e.key) {
        case "k":
          e.preventDefault();
          document.querySelector<HTMLInputElement>("[data-search-input]")?.focus();
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
    [openAdd, openSettings],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
