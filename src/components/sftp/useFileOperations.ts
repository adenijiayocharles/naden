import { useState } from "react";
import { sftpCommands } from "../../lib/commands/sftp";
import { formatError, isAlreadyExistsError } from "../../lib/errors";
import { joinPath } from "../../lib/path";
import type { SftpSession } from "../../store/sftpStore";

interface FileOperationsInput {
  sessionId: string;
  session: SftpSession | undefined;
  navigate: (path: string) => Promise<void>;
  selected: string[];
  setSelected: (paths: string[]) => void;
  setBusy: (v: boolean) => void;
  setError: (v: string | null) => void;
  setOverwriteConfirm: (v: { message: string; onConfirm: () => void } | null) => void;
}

interface FileOperationsOutput {
  renaming: string | null;
  renameValue: string;
  creatingFolder: boolean;
  creatingFile: boolean;
  confirmingDelete: boolean;
  chmodTarget: { path: string; mode: number } | null;
  chmodMode: number;
  handleRenameStart: (path: string) => void;
  setRenameValue: (v: string) => void;
  commitRename: () => void;
  setRenaming: (v: string | null) => void;
  handleDelete: () => void;
  commitDelete: () => void;
  handleNewFolder: () => void;
  commitNewFolder: (name: string) => void;
  handleNewFile: () => void;
  commitNewFile: (name: string) => void;
  handleChmod: (path: string, mode: number) => void;
  setChmodMode: (mode: number) => void;
  commitChmod: () => void;
  cancelChmod: () => void;
  setCreatingFolder: (v: boolean) => void;
  setCreatingFile: (v: boolean) => void;
  setConfirmingDelete: (v: boolean) => void;
}

export function useFileOperations(input: FileOperationsInput): FileOperationsOutput {
  const { sessionId, session, navigate, selected, setSelected, setBusy, setError, setOverwriteConfirm } = input;

  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creatingFile, setCreatingFile] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [chmodTarget, setChmodTarget] = useState<{ path: string; mode: number } | null>(null);
  const [chmodMode, setChmodMode] = useState(0o644);

  const handleRenameStart = (path: string) => {
    if (!session) return;
    const entry = session.entries.find((e) => e.path === path);
    if (!entry) return;
    setRenaming(path);
    setRenameValue(entry.name);
    setSelected([path]);
  };

  const commitRename = async (overwrite = false) => {
    if (!renaming || !renameValue.trim()) { setRenaming(null); return; }
    const dir = renaming.split("/").slice(0, -1).join("/");
    const newPath = `${dir}/${renameValue.trim()}`;
    if (newPath === renaming) { setRenaming(null); return; }
    setBusy(true);
    setError(null);
    try {
      await sftpCommands.renameSftp(sessionId, renaming, newPath, overwrite);
      setRenaming(null);
      if (session) await navigate(session.currentPath);
    } catch (e) {
      if (isAlreadyExistsError(e) && !overwrite) {
        setOverwriteConfirm({ message: formatError(e), onConfirm: () => { setOverwriteConfirm(null); void commitRename(true); } });
        return;
      }
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = () => { if (selected.length > 0) setConfirmingDelete(true); };

  const commitDelete = async () => {
    setConfirmingDelete(false);
    setBusy(true);
    setError(null);
    try {
      let failed = 0;
      for (const path of selected) {
        try {
          await sftpCommands.deleteSftp(sessionId, path);
        } catch {
          failed++;
        }
      }
      if (failed > 0) setError(`${failed} item(s) could not be deleted.`);
      if (session) await navigate(session.currentPath);
    } finally {
      setBusy(false);
    }
  };

  const handleNewFolder = () => { setCreatingFolder(true); };

  const commitNewFolder = async (name: string) => {
    if (!name || !session) { setCreatingFolder(false); return; }
    setBusy(true);
    setError(null);
    try {
      await sftpCommands.mkdirSftp(sessionId, joinPath(session.currentPath, name));
      setCreatingFolder(false);
      await navigate(session.currentPath);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleNewFile = () => { setCreatingFile(true); };

  const commitNewFile = async (name: string) => {
    if (!name || !session) { setCreatingFile(false); return; }
    setBusy(true);
    setError(null);
    try {
      await sftpCommands.touchSftpFile(sessionId, joinPath(session.currentPath, name));
      setCreatingFile(false);
      await navigate(session.currentPath);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleChmod = (path: string, currentMode: number) => {
    setChmodMode(currentMode & 0o777);
    setChmodTarget({ path, mode: currentMode & 0o777 });
  };

  const cancelChmod = () => setChmodTarget(null);

  const commitChmod = async () => {
    if (!chmodTarget) return;
    setBusy(true);
    setError(null);
    try {
      await sftpCommands.chmodSftp(sessionId, chmodTarget.path, chmodMode);
      setChmodTarget(null);
      if (session) await navigate(session.currentPath);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  return {
    renaming,
    renameValue,
    creatingFolder,
    creatingFile,
    confirmingDelete,
    chmodTarget,
    chmodMode,
    handleRenameStart,
    setRenameValue,
    commitRename: () => { void commitRename(); },
    setRenaming,
    handleDelete,
    commitDelete: () => { void commitDelete(); },
    handleNewFolder,
    commitNewFolder: (name: string) => { void commitNewFolder(name); },
    handleNewFile,
    commitNewFile: (name: string) => { void commitNewFile(name); },
    handleChmod,
    setChmodMode,
    commitChmod: () => { void commitChmod(); },
    cancelChmod,
    setCreatingFolder,
    setCreatingFile,
    setConfirmingDelete,
  };
}
