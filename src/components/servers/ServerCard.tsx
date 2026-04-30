import { useRef, useEffect, useState } from "react";
import type { Server } from "../../types/server";
import { useServerStore } from "../../store/serverStore";
import { useUiStore } from "../../store/uiStore";
import { sshCommands } from "../../lib/tauriCommands";
import { formatError } from "../../lib/errors";

interface Props {
  server: Server;
}

export default function ServerCard({ server }: Props) {
  const deleteServer = useServerStore((s) => s.deleteServer);
  const openEdit = useUiStore((s) => s.openEdit);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [connecting, setConnecting] = useState(false);
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
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex items-start gap-3 hover:border-gray-600 transition-colors">
      {/* Status dot */}
      <div className="w-2.5 h-2.5 rounded-full bg-gray-600 mt-1.5 shrink-0" />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="font-medium text-white truncate">{server.displayName}</span>
          {server.isJumpHost && (
            <span className="text-xs bg-purple-900 text-purple-300 px-1.5 py-0.5 rounded-full">
              Jump Host
            </span>
          )}
        </div>

        <p className="text-sm text-gray-400 font-mono truncate">
          {server.username ? `${server.username}@` : ""}
          {server.hostname}
          {server.port !== 22 ? `:${server.port}` : ""}
        </p>

        {server.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {server.tags.map((tag) => (
              <span
                key={tag.id}
                className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded"
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
          onClick={() => { void handleConnect(); }}
          disabled={connecting}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-3 py-1.5 rounded-md transition-colors"
        >
          {connecting ? "Opening…" : "Connect"}
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="text-gray-400 hover:text-white p-1.5 rounded hover:bg-gray-700 transition-colors text-lg leading-none"
            aria-label="Server options"
          >
            ⋮
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-9 bg-gray-700 border border-gray-600 rounded-lg shadow-xl z-20 min-w-[140px] py-1">
              <button
                onClick={() => { openEdit(server.id); setMenuOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-600 transition-colors"
              >
                Edit
              </button>

              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-gray-600 transition-colors"
                >
                  Delete
                </button>
              ) : (
                <div className="px-3 py-2 border-t border-gray-600">
                  <p className="text-xs text-gray-300 mb-2">Delete this server?</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="text-xs text-gray-400 hover:text-white"
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
