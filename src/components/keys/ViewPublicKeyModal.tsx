import { useEffect, useState } from "react";
import { useSshKeyStore } from "../../store/sshKeyStore";
import { clipboardCommands } from "../../lib/commands/local";
import { formatError } from "../../lib/errors";
import type { SshKey } from "../../types/sshKey";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";

export default function ViewPublicKeyModal({ sshKey, onClose }: { sshKey: SshKey; onClose: () => void }) {
  const getPublicKey = useSshKeyStore((s) => s.getPublicKey);
  const [pubKey, setPubKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getPublicKey(sshKey.id)
      .then(setPubKey)
      .catch((e: unknown) => setError(formatError(e)));
  }, [sshKey.id, getPublicKey]);

  const copy = async () => {
    if (!pubKey) return;
    await clipboardCommands.writeText(pubKey.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Public Key</DialogTitle>
          <DialogDescription className="font-mono">{sshKey.keyPath}.pub</DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-xs text-error">{error}</p>
        ) : pubKey === null ? (
          <p className="text-sm text-faint">Loading…</p>
        ) : (
          <div className="bg-surface-1 border border-stroke rounded-lg p-3 max-h-48 overflow-y-auto">
            <pre className="text-xs text-secondary font-mono break-all whitespace-pre-wrap select-all">
              {pubKey.trim()}
            </pre>
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" size="lg" onClick={onClose}>Close</Button>
          <Button
            size="lg"
            onClick={() => { void copy(); }}
            disabled={!pubKey}
            className={copied ? "bg-success/20 text-success border border-success/30" : ""}
          >
            {copied ? "Copied!" : "Copy to Clipboard"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
