import { useState } from "react";
import { useServerStore } from "../../store/serverStore";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { formatError } from "../../lib/errors";
import type { Group } from "../../types/server";

const COLORS = ["#e53e3e","#ed8936","#ecc94b","#48bb78","#38b2ac","#4299e1","#667eea","#ed64a6","#a0aec0"];

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={`w-5 h-5 rounded-full transition-transform ${value === c ? "scale-125 ring-2 ring-white/30" : "hover:scale-110"}`}
          style={{ backgroundColor: c }}
        />
      ))}
      <button
        onClick={() => onChange("")}
        className={`w-5 h-5 rounded-full border transition-transform ${!value ? "scale-125 ring-2 ring-stroke border-stroke" : "border-[#444] hover:scale-110"}`}
      />
    </div>
  );
}

export function GroupCreateModal({ onClose }: { onClose: () => void }) {
  const createGroup = useServerStore((s) => s.createGroup);
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      await createGroup(name.trim(), color || undefined);
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
        <h3 className="text-title text-white mb-4">New Group</h3>
        <div className="space-y-3">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) void handleCreate(); }}
            placeholder="Group name" />
          <div>
            <p className="text-meta text-faint mb-2">Color</p>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          {error && <p className="text-xs text-error">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { void handleCreate(); }} disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function GroupEditModal({ group, onClose, onDelete }: { group: Group; onClose: () => void; onDelete: () => void }) {
  const updateGroup = useServerStore((s) => s.updateGroup);
  const [name, setName] = useState(group.name);
  const [color, setColor] = useState(group.color ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateGroup(group.id, name.trim(), color || undefined);
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
        <h3 className="text-title text-white mb-4">Edit Group</h3>
        <div className="space-y-3">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Group name" />
          <div>
            <p className="text-meta text-faint mb-2">Color</p>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          {error && <p className="text-xs text-error">{error}</p>}
        </div>
        <div className="flex items-center gap-2 mt-5">
          <Button variant="ghost" className="text-red-500 hover:text-red-400 mr-auto px-0" onClick={onDelete} disabled={busy}>Delete</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { void handleSave(); }} disabled={busy || !name.trim()}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
