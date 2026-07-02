import { useState } from "react";
import { useServerStore } from "../../store/serverStore";
import { useBroadcastStore, type SavedBroadcastGroup } from "../../store/broadcastStore";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { formatError } from "../../lib/errors";

export function BroadcastGroupEditModal({
  group,
  onClose,
}: {
  group: SavedBroadcastGroup;
  onClose: () => void;
}) {
  const servers = useServerStore((s) => s.servers);
  const updateSaved = useBroadcastStore((s) => s.updateSaved);
  const deleteSaved = useBroadcastStore((s) => s.deleteSaved);
  const disbandGroup = useBroadcastStore((s) => s.disbandGroup);
  const broadcastGroups = useBroadcastStore((s) => s.groups);

  const [name, setName] = useState(group.name);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(group.serverIds));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (serverId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(serverId)) next.delete(serverId);
      else next.add(serverId);
      return next;
    });
  };

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateSaved(group.id, name.trim(), [...selectedIds]);
      onClose();
    } catch (e) {
      setError(formatError(e));
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      const active = broadcastGroups.find((ag) => ag.savedId === group.id);
      if (active) disbandGroup(active.id);
      await deleteSaved(group.id);
      onClose();
    } catch (e) {
      setError(formatError(e));
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-backdrop-in flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-1/80 backdrop-blur-2xl border border-stroke-subtle rounded-xl shadow-overlay animate-overlay-in w-full max-w-sm flex flex-col max-h-[80vh]">
        <div className="p-5 border-b border-stroke-subtle shrink-0">
          <h3 className="text-title text-white mb-3">Edit Broadcast Group</h3>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim() && selectedIds.size > 0) void handleSave(); }}
            placeholder="Group name"
          />
        </div>

        <div className="overflow-y-auto flex-1 p-2 space-y-0.5">
          {servers.map((s) => (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-sm text-left transition-colors ${
                selectedIds.has(s.id)
                  ? "bg-accent/10 text-white"
                  : "text-secondary hover:bg-surface-3 hover:text-white"
              }`}
            >
              <span
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  selectedIds.has(s.id) ? "bg-accent border-accent" : "border-stroke-subtle"
                }`}
              >
                {selectedIds.has(s.id) && (
                  <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 6l3 3 5-5" />
                  </svg>
                )}
              </span>
              <span className="truncate flex-1">{s.displayName}</span>
              <span className="text-xs text-muted shrink-0">{s.hostname}</span>
            </button>
          ))}
        </div>

        {error && <p className="text-xs text-error px-5 pb-2 shrink-0">{error}</p>}

        <div className="flex items-center gap-2 p-4 border-t border-stroke-subtle shrink-0">
          <Button
            variant="ghost"
            className="text-red-500 hover:text-red-400 mr-auto px-0"
            onClick={() => { void handleDelete(); }}
            disabled={busy}
          >
            Delete
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            onClick={() => { void handleSave(); }}
            disabled={busy || !name.trim() || selectedIds.size === 0}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
