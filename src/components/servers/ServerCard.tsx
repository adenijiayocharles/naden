import { useRef, useEffect, useState } from "react";
import type { Server } from "../../types/server";
import { useServerStore } from "../../store/serverStore";
import { useUiStore } from "../../store/uiStore";
import { useTerminalStore } from "../../store/terminalStore";
import { sshCommands } from "../../lib/tauriCommands";
import { formatError } from "../../lib/errors";

interface Props {
  server: Server;
}

export default function ServerCard({ server }: Props) {
  const deleteServer = useServerStore((s) => s.deleteServer);
  const openEdit = useUiStore((s) => s.openEdit);
  const openSession = useTerminalStore((s) => s.openSession);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [openingTerminal, setOpeningTerminal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmDelete(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      await sshCommands.launchInTerminal(server.id);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setConnecting(false);
    }
  };

  const handleOpenTerminal = async () => {
    setOpeningTerminal(true);
    setError(null);
    try {
      const result = await openSession(server.id, server.displayName);
      if (result === null) {
        setError("Maximum terminal sessions (20) reached");
      }
    } catch (e) {
      setError(formatError(e));
    } finally {
      setOpeningTerminal(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteServer(server.id);
    } catch (e) {
      setError(formatError(e));
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="bg-[#111] border border-[#1e1e1e] rounded-lg p-4 flex items-start gap-3 hover:border-[#2a2a2a] transition-colors">
      {/* Status dot */}
      <div className="w-2 h-2 rounded-full bg-[#333] mt-1.5 shrink-0" />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="font-medium text-white truncate">{server.displayName}</span>
          {server.isJumpHost && (
            <span className="text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded font-medium">
              Jump Host
            </span>
          )}
        </div>

        <p className="text-sm text-[#888] font-mono truncate">
          {server.username ? `${server.username}@` : ""}
          {server.hostname}
          {server.port !== 22 ? `:${server.port}` : ""}
        </p>

        {server.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {server.tags.map((tag) => (
              <span
                key={tag.id}
                className="text-xs bg-[#1a1a1a] border border-[#2a2a2a] text-[#999] px-1.5 py-0.5 rounded"
              >
                #{tag.name}
              </span>
            ))}
          </div>
        )}

        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => { void handleOpenTerminal(); }}
          disabled={openingTerminal}
          className="bg-[#1a1a1a] hover:bg-[#222] disabled:opacity-40 border border-[#2a2a2a] text-[#ccc] text-sm font-medium px-3 py-1.5 rounded transition-colors"
        >
          {openingTerminal ? "…" : "Terminal"}
        </button>
        <button
          onClick={() => { void handleConnect(); }}
          disabled={connecting}
          className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-black text-sm font-semibold px-3 py-1.5 rounded transition-colors"
        >
          {connecting ? "Opening…" : "Connect"}
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="text-[#777] hover:text-white p-1.5 rounded hover:bg-[#1a1a1a] transition-colors text-lg leading-none"
            aria-label="Server options"
          >
            ⋮
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-9 bg-[#161616] border border-[#2a2a2a] rounded-lg shadow-2xl z-20 min-w-[140px] py-1">
              <button
                onClick={() => { openEdit(server.id); setMenuOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-[#bbb] hover:bg-[#1e1e1e] hover:text-white transition-colors"
              >
                Edit
              </button>

              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-[#1e1e1e] transition-colors"
                >
                  Delete
                </button>
              ) : (
                <div className="px-3 py-2 border-t border-[#2a2a2a]">
                  <p className="text-xs text-[#bbb] mb-2">Delete this server?</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="text-xs text-[#777] hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="text-xs text-red-400 hover:text-red-300 font-semibold"
                    >
                      {deleting ? "…" : "Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
