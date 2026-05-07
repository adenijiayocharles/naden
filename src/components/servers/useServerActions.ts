import { useRef, useEffect, useState } from "react";
import type { Server } from "../../types/server";
import { useServerStore } from "../../store/serverStore";
import { useUiStore } from "../../store/uiStore";
import { useTerminalStore } from "../../store/terminalStore";
import { sshCommands } from "../../lib/tauriCommands";
import { formatError } from "../../lib/errors";

export function useServerActions(server: Server) {
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

  const editServer = () => { openEdit(server.id); setMenuOpen(false); };

  return {
    menuRef,
    menuOpen, setMenuOpen,
    confirmDelete, setConfirmDelete,
    deleting, connecting, openingTerminal,
    error,
    handleConnect,
    handleSystemTerminal,
    handleDelete,
    editServer,
  };
}

/** Host string shared by both card and row views */
export function formatHost(server: Server): string {
  const prefix = server.username ? `${server.username}@` : "";
  const suffix = server.port !== 22 ? `:${server.port}` : "";
  return `${prefix}${server.hostname}${suffix}`;
}
