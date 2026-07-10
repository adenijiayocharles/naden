import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir, join } from "@tauri-apps/api/path";
import { useSshKeyStore } from "../../store/sshKeyStore";
import { formatError } from "../../lib/errors";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";

export default function AddKeyModal({ onClose }: { onClose: () => void }) {
  const addKey = useSshKeyStore((s) => s.addKey);
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const browse = async () => {
    try {
      const home = await homeDir();
      const sshDir = await join(home, ".ssh");
      const result = await open({ multiple: false, title: "Select SSH Private Key", defaultPath: sshDir });
      if (typeof result === "string") setPath(result);
    } catch {
      // user cancelled
    }
  };

  const submit = async () => {
    if (!path.trim()) { setError("Path is required"); return; }
    setSaving(true);
    setError(null);
    try {
      await addKey(path.trim(), name.trim() || undefined);
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
          <DialogTitle>Add Existing Key</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-secondary">Private key path</label>
            <div className="flex gap-2">
              <Input
                value={path}
                onChange={(e) => { setPath(e.target.value); setError(null); }}
                placeholder="~/.ssh/id_ed25519"
                className="flex-1"
                autoFocus
              />
              <Button type="button" variant="secondary" size="lg" onClick={() => { void browse(); }} className="border border-stroke shrink-0">
                Browse
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-secondary">
              Display name <span className="text-faint">(optional)</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My deploy key"
              onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
            />
          </div>
          {error && <p className="text-xs text-error">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="lg" onClick={() => { void submit(); }} disabled={saving || !path.trim()}>
            {saving ? "Adding…" : "Add Key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
