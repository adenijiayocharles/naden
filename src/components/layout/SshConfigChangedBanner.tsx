import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Button } from "../ui/button";
import { useUiStore } from "../../store/uiStore";

export default function SshConfigChangedBanner() {
  const [show, setShow] = useState(false);
  const openImportSshConfig = useUiStore((s) => s.openImportSshConfig);

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    listen<void>("ssh:config-changed", () => setShow(true))
      .then((unlisten) => { cleanup = unlisten; });
    return () => { cleanup?.(); };
  }, []);

  if (!show) return null;

  return (
    <div className="fixed top-14 right-4 z-50 flex items-center gap-3 bg-surface-3 border border-stroke rounded-lg shadow-overlay px-4 py-2.5 text-muted">
      <svg className="w-3.5 h-3.5 shrink-0 text-faint" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 2.5h11a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z" />
        <path strokeLinecap="round" d="M1.5 6.5h13" />
      </svg>
      <span className="text-sm">~/.ssh/config changed externally</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => { openImportSshConfig(); setShow(false); }}
        className="text-accent hover:text-white"
      >
        Re-import
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => setShow(false)}
        className="text-dim hover:text-white text-base leading-none"
        aria-label="Dismiss"
      >
        ×
      </Button>
    </div>
  );
}
