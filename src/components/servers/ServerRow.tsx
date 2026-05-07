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

export default function ServerRow({ server }: Props) {
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
    if (connecting) return;
    setConnecting(true);
    setError(null);
    try {
      const result = await openSession(server.id, server.displayName);
      if (result === null) setError("Maximum terminal sessions (20) reached");
    } catch (e) {
      setError(formatError(e));
    } finally {
      setConnecting(false);
    }
  };

  const handleSystemTerminal = async () => {
    setMenuOpen(false);
    setOpeningTerminal(true);
    setError(null);
    try {
      await sshCommands.launchInTerminal(server.id);
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
    <div
      onClick={() => { void handleConnect(); }}
      className={`group flex items-center gap-3 px-3 py-2.5 border-b border-[#1a1a1a] last:border-b-0 first:rounded-t-lg last:rounded-b-lg select-none transition-colors
        ${connecting ? "opacity-60 cursor-wait bg-[#0d0d0d]" : "cursor-pointer hover:bg-[#0f0f0f]"}`}
    >
      {/* Status dot */}
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${connecting ? "bg-accent animate-pulse" : "bg-[#333]"}`} />

      {/* Name */}
      <span className="w-40 shrink-0 truncate text-sm font-medium text-white">
        {server.displayName}
      </span>

      {/* Host */}
      <span className="flex-1 min-w-0 truncate text-sm text-[#666] font-mono">
        {server.username ? `${server.username}@` : ""}
        {server.hostname}
        {server.port !== 22 ? `:${server.port}` : ""}
      </span>

      {/* Tags */}
      <div className="hidden md:flex items-center gap-1 shrink-0">
        {server.isJumpHost && (
          <span className="text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded">Jump</span>
        )}
        {server.tags.slice(0, 3).map((tag) => (
          <span
            key={tag.id}
            className="text-xs bg-[#1a1a1a] border border-[#2a2a2a] text-[#666] px-1.5 py-0.5 rounded"
          >
            #{tag.name}
          </span>
        ))}
        {server.tags.length > 3 && (
          <span className="text-xs text-[#444]">+{server.tags.length - 3}</span>
        )}
      </div>

      {error && <span className="text-xs text-red-400 shrink-0 max-w-[160px] truncate">{error}</span>}

      {/* Kebab — stops propagation so it doesn't trigger connect */}
      <div
        className="relative shrink-0"
        ref={menuRef}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="text-[#444] hover:text-white p-1 rounded hover:bg-[#1a1a1a] transition-colors text-base leading-none opacity-0 group-hover:opacity-100"
          aria-label="Server options"
        >
          ⋮
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-8 bg-[#161616] border border-[#2a2a2a] rounded-lg shadow-2xl z-20 min-w-[150px] py-1">
            <button
              onClick={() => { openEdit(server.id); setMenuOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-[#bbb] hover:bg-[#1e1e1e] hover:text-white transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => { void handleSystemTerminal(); }}
              disabled={openingTerminal}
              className="w-full text-left px-3 py-2 text-sm text-[#bbb] hover:bg-[#1e1e1e] hover:text-white transition-colors disabled:opacity-40"
            >
              {openingTerminal ? "Opening…" : "System Terminal"}
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
                  <button onClick={() => setConfirmDelete(false)} className="text-xs text-[#777] hover:text-white">
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
  );
}
