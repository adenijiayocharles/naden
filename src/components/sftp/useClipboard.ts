import { useState } from "react";
import { sftpCommands } from "../../lib/tauriCommands";
import { formatError, isAlreadyExistsError } from "../../lib/errors";
import { joinPath } from "../../lib/path";
import type { SftpSession } from "../../store/sftpStore";

interface Clipboard {
  paths: string[];
  sourceDir: string;
  mode: "cut" | "copy";
}

interface ClipboardInput {
  sessionId: string;
  session: SftpSession | undefined;
  navigate: (path: string) => Promise<void>;
  selected: string[];
  setBusy: (v: boolean) => void;
  setError: (v: string | null) => void;
  setOverwriteConfirm: (v: { message: string; onConfirm: () => void } | null) => void;
}

interface ClipboardOutput {
  clipboard: Clipboard | null;
  handleCut: () => void;
  handleCopy: () => void;
  handlePaste: () => void;
  clearClipboard: () => void;
}

export function useClipboard(input: ClipboardInput): ClipboardOutput {
  const { sessionId, session, navigate, selected, setBusy, setError, setOverwriteConfirm } = input;

  const [clipboard, setClipboard] = useState<Clipboard | null>(null);

  const handleCut = () => {
    if (!session || selected.length === 0) return;
    setClipboard({ paths: selected, sourceDir: session.currentPath, mode: "cut" });
  };

  const handleCopy = () => {
    if (!session || selected.length === 0) return;
    setClipboard({ paths: selected, sourceDir: session.currentPath, mode: "copy" });
  };

  const handlePaste = async (overwrite = false, startIndex = 0) => {
    if (!clipboard || !session) return;
    setBusy(true);
    setError(null);
    let failed = 0;
    let firstError: string | null = null;
    for (let i = startIndex; i < clipboard.paths.length; i++) {
      const srcPath = clipboard.paths[i];
      const name = srcPath.split("/").pop() ?? srcPath;
      const destPath = joinPath(session.currentPath, name);
      // Skip if source and destination are identical (pasting into same folder with cut)
      if (srcPath === destPath) continue;
      try {
        if (clipboard.mode === "cut") {
          await sftpCommands.renameSftp(sessionId, srcPath, destPath, overwrite);
        } else {
          await sftpCommands.copySftpFile(sessionId, srcPath, destPath, overwrite);
        }
      } catch (e) {
        if (isAlreadyExistsError(e) && !overwrite) {
          setBusy(false);
          setOverwriteConfirm({ message: formatError(e), onConfirm: () => { setOverwriteConfirm(null); void handlePaste(true, i); } });
          return;
        }
        failed++;
        if (!firstError) firstError = formatError(e);
      }
    }
    const verb = clipboard.mode === "cut" ? "moved" : "copied";
    if (failed > 0) setError(`${failed} item(s) could not be ${verb}: ${firstError ?? "unknown error"}`);
    setClipboard(null);
    await navigate(session.currentPath);
    setBusy(false);
  };

  return {
    clipboard,
    handleCut,
    handleCopy,
    handlePaste: () => { void handlePaste(); },
    clearClipboard: () => setClipboard(null),
  };
}
