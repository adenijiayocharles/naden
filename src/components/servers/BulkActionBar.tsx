import { useState } from "react";
import { useUiStore } from "../../store/uiStore";
import { useServerStore } from "../../store/serverStore";
import { formatError } from "../../lib/errors";

export default function BulkActionBar() {
  const bulkSelected = useUiStore((s) => s.bulkSelected);
  const clearSelected = useUiStore((s) => s.clearSelected);
  const toggleBulkMode = useUiStore((s) => s.toggleBulkMode);
  const selectAll = useUiStore((s) => s.selectAll);
  const servers = useServerStore((s) => s.servers);
  const groups = useServerStore((s) => s.groups);
  const deleteServer = useServerStore((s) => s.deleteServer);
  const updateServer = useServerStore((s) => s.updateServer);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGroupPicker, setShowGroupPicker] = useState(false);

  const count = bulkSelected.length;
  const visibleIds = servers.map((s) => s.id);

  const handleSelectAll = () => selectAll(visibleIds);

  const handleDeleteAll = async () => {
    if (!confirm(`Delete ${count} server${count !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      await Promise.all(bulkSelected.map((id) => deleteServer(id)));
      toggleBulkMode();
    } catch (e) {
      setError(formatError(e));
      setBusy(false);
    }
  };

  const handleMoveToGroup = async (groupId: string | null) => {
    setShowGroupPicker(false);
    setBusy(true);
    setError(null);
    try {
      await Promise.all(
        bulkSelected.map((id) => updateServer(id, { groupId: groupId ?? undefined })),
      );
      clearSelected();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shrink-0 border-t border-[#1e1e1e] bg-[#111] px-4 py-2.5 flex items-center gap-3">
      <span className="text-xs text-[#888]">
        {count === 0 ? "None selected" : `${count} selected`}
      </span>

      <button
        onClick={handleSelectAll}
        disabled={busy}
        className="text-xs text-[#666] hover:text-white transition-colors disabled:opacity-40"
      >
        Select all
      </button>

      <button
        onClick={clearSelected}
        disabled={busy || count === 0}
        className="text-xs text-[#666] hover:text-white transition-colors disabled:opacity-40"
      >
        Clear
      </button>

      <div className="ml-auto flex items-center gap-2 relative">
        {error && <span className="text-xs text-red-400 max-w-xs truncate">{error}</span>}

        {/* Move to group */}
        <div className="relative">
          <button
            onClick={() => setShowGroupPicker((v) => !v)}
            disabled={busy || count === 0}
            className="px-3 py-1 rounded text-xs bg-[#1a1a1a] border border-[#2a2a2a] text-[#aaa] hover:text-white hover:border-[#444] transition-colors disabled:opacity-40"
          >
            Move to group…
          </button>

          {showGroupPicker && (
            <div className="absolute bottom-full mb-1 right-0 bg-[#161616] border border-[#2a2a2a] rounded-lg shadow-2xl min-w-[160px] py-1 z-30">
              <button
                onClick={() => { void handleMoveToGroup(null); }}
                className="w-full text-left px-3 py-2 text-sm text-[#bbb] hover:bg-[#1e1e1e] hover:text-white transition-colors"
              >
                Ungrouped
              </button>
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => { void handleMoveToGroup(g.id); }}
                  className="w-full text-left px-3 py-2 text-sm text-[#bbb] hover:bg-[#1e1e1e] hover:text-white transition-colors flex items-center gap-2"
                >
                  {g.color && (
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                  )}
                  {g.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Delete */}
        <button
          onClick={() => { void handleDeleteAll(); }}
          disabled={busy || count === 0}
          className="px-3 py-1 rounded text-xs bg-red-950/50 border border-red-900/50 text-red-400 hover:bg-red-900/40 hover:text-red-300 transition-colors disabled:opacity-40"
        >
          {busy ? "Deleting…" : `Delete ${count > 0 ? count : ""}`}
        </button>
      </div>
    </div>
  );
}
