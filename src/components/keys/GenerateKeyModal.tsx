import { useState } from "react";
import { useSshKeyStore } from "../../store/sshKeyStore";
import { formatError } from "../../lib/errors";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";

type KeyType = "ed25519" | "rsa" | "ecdsa";

interface GenForm {
  name: string;
  keyType: KeyType;
  outputPath: string;
  passphrase: string;
  confirmPassphrase: string;
}

const BLANK_GEN: GenForm = {
  name: "",
  keyType: "ed25519",
  outputPath: "~/.ssh/",
  passphrase: "",
  confirmPassphrase: "",
};

export default function GenerateKeyModal({ onClose }: { onClose: () => void }) {
  const generateKey = useSshKeyStore((s) => s.generateKey);
  const [form, setForm] = useState<GenForm>(BLANK_GEN);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pathEdited, setPathEdited] = useState(false);

  const set = (field: keyof GenForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = e.target.value;
      setForm((f) => {
        const next = { ...f, [field]: value };
        if (field === "name" && !pathEdited) {
          const filename = value.toLowerCase().replace(/\s+/g, "_");
          next.outputPath = filename ? `~/.ssh/${filename}` : "~/.ssh/";
        }
        return next;
      });
      setError(null);
    };

  const handlePathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPathEdited(true);
    setForm((f) => ({ ...f, outputPath: e.target.value }));
    setError(null);
  };

  const submit = async () => {
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (!form.outputPath.trim()) { setError("Output path is required"); return; }
    if (form.passphrase !== form.confirmPassphrase) { setError("Passphrases do not match"); return; }
    setSaving(true);
    setError(null);
    try {
      await generateKey({
        name: form.name.trim(),
        keyType: form.keyType,
        outputPath: form.outputPath.trim(),
        passphrase: form.passphrase || undefined,
      });
      onClose();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Generate New Key</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-secondary">Name</label>
            <Input value={form.name} onChange={set("name")} placeholder="My server key" autoFocus />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-sm text-secondary">Key type</label>
              <Select
                value={form.keyType}
                onValueChange={(value) => {
                  setForm((f) => ({ ...f, keyType: value as KeyType }));
                  setError(null);
                }}
              >
                <SelectTrigger className="w-full h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ed25519">Ed25519 (recommended)</SelectItem>
                  <SelectItem value="rsa">RSA 4096</SelectItem>
                  <SelectItem value="ecdsa">ECDSA 521</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-secondary">Save to</label>
            <Input
              value={form.outputPath}
              onChange={handlePathChange}
              placeholder="~/.ssh/id_ed25519"
            />
            <p className="text-xs text-faint">Public key will be saved alongside as <code className="font-mono">.pub</code></p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-secondary">
              Passphrase <span className="text-faint">(optional)</span>
            </label>
            <Input
              type="password"
              value={form.passphrase}
              onChange={set("passphrase")}
              placeholder="Leave empty for no passphrase"
              autoComplete="new-password"
            />
          </div>
          {form.passphrase && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-secondary">Confirm passphrase</label>
              <Input
                type="password"
                value={form.confirmPassphrase}
                onChange={set("confirmPassphrase")}
                placeholder="Re-enter passphrase"
                autoComplete="new-password"
                onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
              />
            </div>
          )}
          {error && <p className="text-xs text-error">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="lg" onClick={() => { void submit(); }} disabled={saving}>
            {saving ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
