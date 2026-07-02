import { useRef, useEffect, useState } from "react";
import type { Server } from "../../types/server";
import { useServerStore } from "../../store/serverStore";
import { useUiStore } from "../../store/uiStore";

import { useTerminalStore } from "../../store/terminalStore";
import { useSftpStore } from "../../store/sftpStore";
import { useVaultStore } from "../../store/vaultStore";
import { sshCommands, vaultCommands } from "../../lib/tauriCommands";
import { formatError } from "../../lib/errors";
import { activateAutoClear } from "../../lib/clipboardClear";
export { formatHost } from "../../lib/format";

export function useServerActions(server: Server) {
  const isVaultUnlocked = useVaultStore((s) => s.isUnlocked);

  const deleteServer = useServerStore((s) => s.deleteServer);
  const moveServerGroup = useServerStore((s) => s.moveServerGroup);
  const toggleFavourite = useServerStore((s) => s.toggleFavourite);
  const duplicateServer = useServerStore((s) => s.duplicateServer);
  const checkReachability = useServerStore((s) => s.checkReachability);
  const openEdit = useUiStore((s) => s.openEdit);
  const openSession = useTerminalStore((s) => s.openSession);
  const openSftpSession = useSftpStore((s) => s.openSession);

  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [openingTerminal, setOpeningTerminal] = useState(false);
  const [openingBrowser, setOpeningBrowser] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [checkingReachability, setCheckingReachability] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const [connectionError, setConnectionError] = useState<string | null>(null);

  const handleConnect = async () => {
    if (connecting) return;
    setConnecting(true);
    setError(null);
    try {
      const result = await openSession(server.id, server.displayName);
      if (result === null) setConnectionError("Maximum terminal sessions (20) reached");
    } catch (e) {
      setConnectionError(formatError(e));
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

  const handleCopyPassword = async () => {
    setMenuOpen(false);
    if (!server.vaultCredentialId) return;
    try {
      await vaultCommands.copyCredentialToClipboard(server.id, server.vaultCredentialId);
      activateAutoClear();
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleMoveToGroup = async (groupId: string | null) => {
    setMenuOpen(false);
    setError(null);
    try {
      await moveServerGroup(server.id, groupId);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleToggleFavourite = async () => {
    setMenuOpen(false);
    try {
      await toggleFavourite(server.id);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleDuplicate = async () => {
    setMenuOpen(false);
    setDuplicating(true);
    setError(null);
    try {
      await duplicateServer(server.id);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setDuplicating(false);
    }
  };

  const handleCheckReachability = async () => {
    setMenuOpen(false);
    setCheckingReachability(true);
    try {
      await checkReachability(server.id);
    } finally {
      setCheckingReachability(false);
    }
  };

  const handleBrowseFiles = async () => {
    setMenuOpen(false);
    setOpeningBrowser(true);
    setError(null);
    try {
      await openSftpSession(server.id, server.displayName);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setOpeningBrowser(false);
    }
  };

  const handleDelete = () => { setMenuOpen(false); setDeleteModalOpen(true); };

  const commitDelete = async () => {
    setDeleting(true);
    try {
      await deleteServer(server.id);
      setDeleteModalOpen(false);
    } catch (e) {
      setError(formatError(e));
      setDeleting(false);
    }
  };

  const editServer = () => { openEdit(server.id); setMenuOpen(false); };

  return {
    canCopyPassword: isVaultUnlocked && server.authMethod === "password" && !!server.vaultCredentialId,
    menuRef,
    menuOpen, setMenuOpen,
    deleteModalOpen, setDeleteModalOpen,
    connectionError, setConnectionError,
    deleting, connecting, openingTerminal, openingBrowser, duplicating, checkingReachability,
    error,
    handleConnect,
    handleSystemTerminal,
    handleBrowseFiles,
    handleCopyPassword,
    handleMoveToGroup,
    handleToggleFavourite,
    handleDuplicate,
    handleCheckReachability,
    handleDelete,
    commitDelete,
    editServer,
  };
}

