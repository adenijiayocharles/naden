import { useState } from "react";
import { useServerStore } from "../../store/serverStore";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { formatError } from "../../lib/errors";
import type { Tag } from "../../types/server";

export function TagRenameModal({ tag, onClose }: { tag: Tag; onClose: () => void }) {
  const renameTag = useServerStore((s) => s.renameTag);
  const [name, setName] = useState(tag.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim() || name.trim() === tag.name) { onClose(); return; }
    setBusy(true);
    setError(null);
    try {
      await renameTag(tag.id, name.trim());
      onClose();
    } catch (e) {
      setError(formatError(e));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-backdrop-in flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface-1/80 backdrop-blur-2xl border border-stroke-subtle rounded-xl shadow-overlay animate-overlay-in w-full max-w-sm p-5">
        <h3 className="text-title text-white mb-4">Rename Tag</h3>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); if (e.key === "Escape") onClose(); }}
          placeholder="Tag name" />
        {error && <p className="text-xs text-error mt-2">{error}</p>}
        <div className="flex items-center justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { void handleSave(); }} disabled={busy || !name.trim()}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
