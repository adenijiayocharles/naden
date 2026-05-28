import { useState } from "react";
import { useUiStore } from "../../store/uiStore";
import { useServerStore } from "../../store/serverStore";
import { formatError } from "../../lib/errors";
import Button from "../shared/Button";

export default function BulkActionBar() {
  const bulkSelected = useUiStore((s) => s.bulkSelected);
  const clearSelected = useUiStore((s) => s.clearSelected);
  const toggleBulkMode = useUiStore((s) => s.toggleBulkMode);
  const selectAll = useUiStore((s) => s.selectAll);
  const servers = useServerStore((s) => s.servers);
  const groups = useServerStore((s) => s.groups);
  const deleteServer = useServerStore((s) => s.deleteServer);
  const moveServerGroup = useServerStore((s) => s.moveServerGroup);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const count = bulkSelected.length;
  const visibleIds = servers.map((s) => s.id);

  const handleSelectAll = () => selectAll(visibleIds);

  const handleDeleteAll = async () => {
    setBusy(true);
    setError(null);
    setConfirmDelete(false);
    const results = await Promise.allSettled(bulkSelected.map((id) => deleteServer(id)));
    const failed = results
      .map((r, i) => ({ r, id: bulkSelected[i] }))
      .filter(({ r }) => r.status === "rejected");
    const succeededIds = results
      .map((r, i) => ({ r, id: bulkSelected[i] }))
      .filter(({ r }) => r.status === "fulfilled")
      .map(({ id }) => id);

    if (succeededIds.length > 0) {
      useUiStore.setState((s) => ({
        bulkSelected: s.bulkSelected.filter((id) => !succeededIds.includes(id)),
      }));
    }

    if (failed.length === 0) {
      toggleBulkMode();
    } else {
      const firstErr = (failed[0].r as PromiseRejectedResult).reason as unknown;
      setError(formatError(firstErr));
      setBusy(false);
    }
  };

  const handleMoveToGroup = async (groupId: string | null) => {
    setShowGroupPicker(false);
    setBusy(true);
    setError(null);
    try {
      await Promise.all(
        bulkSelected.map((id) => moveServerGroup(id, groupId)),
      );
      clearSelected();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shrink-0 border-t border-stroke-subtle bg-surface-1 px-4 py-2.5 flex items-center gap-3">
      <span className="text-sm text-muted">
        {count > 0 ? `${count} selected` : "Click servers to select"}
      </span>

      <Button size="sm" variant="ghost" onClick={handleSelectAll} disabled={busy}>
        Select all
      </Button>

      <Button size="sm" variant="ghost" onClick={clearSelected} disabled={busy || count === 0}>
        Clear
      </Button>

      <div className="ml-auto flex items-center gap-2 relative">
        {error && <span className="text-sm text-red-400 max-w-xs truncate">{error}</span>}

        {/* Move to group */}
        <div className="relative">
          <Button
            size="sm"
            onClick={() => setShowGroupPicker((v) => !v)}
            disabled={busy || count === 0}
            className="border border-stroke"
          >
            Move to group…
          </Button>

          {showGroupPicker && (
            <div className="absolute bottom-full mb-1 right-0 bg-surface-2 border border-stroke rounded-lg shadow-2xl min-w-[160px] py-1 z-30">
              <button
                onClick={() => { void handleMoveToGroup(null); }}
                className="w-full text-left px-3 py-2 text-sm text-secondary hover:bg-surface-4 hover:text-white transition-colors"
              >
                Ungrouped
              </button>
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => { void handleMoveToGroup(g.id); }}
                  className="w-full text-left px-3 py-2 text-sm text-secondary hover:bg-surface-4 hover:text-white transition-colors flex items-center gap-2"
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
        {confirmDelete ? (
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-red-400">Delete {count} server{count !== 1 ? "s" : ""}?</span>
            <Button
              size="sm"
              onClick={() => { void handleDeleteAll(); }}
              disabled={busy}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              {busy ? "Deleting…" : "Confirm"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="danger"
            onClick={() => setConfirmDelete(true)}
            disabled={busy || count === 0}
          >
            Delete {count > 0 ? count : ""}
          </Button>
        )}
      </div>
    </div>
  );
}
