import { useRef, useState } from "react";
import { useSshKeyStore } from "../../store/sshKeyStore";
import { clipboardCommands } from "../../lib/commands/local";
import { formatError } from "../../lib/errors";
import type { SshKey } from "../../types/sshKey";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

const KEY_TYPE_BADGE: Record<string, string> = {
  ed25519: "bg-green-950/60 border-green-900/60 text-green-400",
  ecdsa:   "bg-blue-950/60 border-blue-900/60 text-blue-400",
  rsa:     "bg-purple-950/60 border-purple-900/60 text-purple-400",
  dsa:     "bg-yellow-950/60 border-yellow-900/60 text-yellow-500",
  unknown: "bg-surface-3 border-stroke text-faint",
};

export default function KeyRow({
  sshKey,
  usageCount,
  onDelete,
  onViewPub,
}: {
  sshKey: SshKey;
  usageCount: number;
  onDelete: () => void;
  onViewPub: () => void;
}) {
  const renameKey = useSshKeyStore((s) => s.renameKey);
  const getPublicKey = useSshKeyStore((s) => s.getPublicKey);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(sshKey.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const startRename = () => {
    setRenameValue(sshKey.name);
    setRenameError(null);
    setIsRenaming(true);
    // Focus after render
    setTimeout(() => renameInputRef.current?.select(), 0);
  };

  const cancelRename = () => {
    setIsRenaming(false);
    setRenameError(null);
  };

  const commitRename = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === sshKey.name) { cancelRename(); return; }
    setRenameSaving(true);
    setRenameError(null);
    try {
      await renameKey(sshKey.id, trimmed);
      setIsRenaming(false);
    } catch (e) {
      setRenameError(formatError(e));
    } finally {
      setRenameSaving(false);
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { void commitRename(); }
    if (e.key === "Escape") { cancelRename(); }
  };

  const copyPublicKey = async () => {
    setCopyError(null);
    try {
      const pub = await getPublicKey(sshKey.id);
      await clipboardCommands.writeText(pub.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setCopyError(formatError(e));
      setTimeout(() => setCopyError(null), 4000);
    }
  };

  const badge = KEY_TYPE_BADGE[sshKey.keyType] ?? KEY_TYPE_BADGE.unknown;

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-surface-1 border border-stroke-subtle rounded-lg hover:border-stroke transition-colors group">
      <div className="w-8 h-8 rounded-lg bg-surface-2 border border-stroke-subtle flex items-center justify-center text-faint shrink-0">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 2a4 4 0 100 8 4 4 0 000-8zM6.5 7.5L2 12" />
          <path d="M3.5 13.5l1-1M5.5 13.5l1-1" />
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        {isRenaming ? (
          <div className="flex items-center gap-2 mb-0.5">
            <Input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={() => { void commitRename(); }}
              autoFocus
              className="h-7 text-sm py-0 px-2 flex-1"
              disabled={renameSaving}
            />
            {renameError && <p className="text-xs text-error shrink-0">{renameError}</p>}
          </div>
        ) : (
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-white truncate">{sshKey.name}</span>
            <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded border ${badge} shrink-0`}>
              {sshKey.keyType.toUpperCase()}
            </span>
            {sshKey.isEncrypted && (
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded border bg-warning-subtle border-warning-subtle text-warning shrink-0">
                passphrase
              </span>
            )}
          </div>
        )}
        <p className="text-xs text-faint font-mono truncate">{sshKey.keyPath}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {sshKey.fingerprint && (
            <p className="text-[11px] text-dim font-mono truncate">{sshKey.fingerprint}</p>
          )}
          {usageCount > 0 && (
            <span className="text-[11px] text-dim shrink-0">
              · used by {usageCount} {usageCount === 1 ? "server" : "servers"}
            </span>
          )}
        </div>
        {copyError && <p className="text-xs text-error mt-0.5">{copyError}</p>}
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Button
          variant="ghost"
          onClick={onViewPub}
          title="View public key"
          className="h-8 px-2.5 text-xs font-medium bg-surface-3 text-secondary border border-stroke hover:border-accent/40 hover:text-white"
        >
          View pub
        </Button>
        <Button
          variant="ghost"
          onClick={() => { void copyPublicKey(); }}
          title="Copy public key"
          className={`h-8 px-2.5 text-xs font-medium ${
            copied
              ? "bg-success-subtle text-success border border-success-subtle"
              : "bg-surface-3 text-secondary border border-stroke hover:border-accent/40 hover:text-white"
          }`}
        >
          {copied ? "Copied!" : "Copy pub"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={startRename}
          title="Rename key"
          className="text-faint hover:text-white hover:bg-surface-3"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M11.5 2.5a2.121 2.121 0 013 3L5 15H2v-3L11.5 2.5z" />
          </svg>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          title="Remove from vault"
          className="text-faint hover:text-error hover:bg-error-subtle"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" />
          </svg>
        </Button>
      </div>
    </div>
  );
}
