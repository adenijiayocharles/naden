import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../ui/button";
import type { Server } from "../../types/server";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  servers: Server[];
  /** Opens a terminal session for the picked server; returns the new session ID, or null if the tab limit was hit. */
  onOpenSession: (serverId: string, serverName: string) => Promise<string | null>;
}

/** "New terminal session" trigger button plus its search-and-pick dropdown. */
export default function NewSessionPicker({ open, onOpenChange, servers, onOpenSession }: Props) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const close = () => {
    onOpenChange(false);
    setQuery("");
    setError(null);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        !pickerRef.current?.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        close();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filteredServers = useMemo(
    () =>
      !query
        ? servers
        : servers.filter(
            (s) =>
              s.displayName.toLowerCase().includes(query.toLowerCase()) ||
              s.hostname.toLowerCase().includes(query.toLowerCase()),
          ),
    [servers, query],
  );

  return (
    <div className="px-1.5 shrink-0 relative">
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon-sm"
        onClick={() => { onOpenChange(!open); setQuery(""); setError(null); }}
        title="New terminal session"
        aria-label="New terminal session"
        className="text-faint hover:text-white"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3v10M3 8h10" />
        </svg>
      </Button>
      {open && (
        <div
          ref={pickerRef}
          className="absolute top-full right-0 mt-1 w-60 bg-surface-2/80 backdrop-blur-xl border border-stroke rounded-lg shadow-overlay z-50 overflow-hidden"
        >
          <div className="p-2 border-b border-stroke-subtle">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") close(); }}
              placeholder="Search servers…"
              className="w-full bg-surface-3 border border-stroke rounded px-2.5 py-1.5 text-sm text-white placeholder-faint outline-none focus:border-accent transition-colors"
            />
          </div>
          {error && (
            <p className="px-3 py-2 text-xs text-error border-b border-stroke-subtle bg-error-subtle">
              {error}
            </p>
          )}
          <div className="max-h-60 overflow-y-auto">
            {filteredServers.length > 0 ? (
              filteredServers.map((server) => (
                <button
                  key={server.id}
                  onClick={async () => {
                    const id = await onOpenSession(server.id, server.displayName);
                    if (id === null) {
                      setError("Maximum terminal sessions (20) reached");
                    } else {
                      close();
                    }
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:bg-surface-3 hover:text-white transition-colors text-left"
                >
                  <span className="flex-1 truncate">{server.displayName}</span>
                  <span className="text-meta text-dim truncate max-w-[90px]">{server.hostname}</span>
                </button>
              ))
            ) : (
              <p className="px-3 py-4 text-center text-sm text-dim">No servers</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
