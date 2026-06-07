import { useState } from "react";
import { useUiStore } from "../../store/uiStore";
import { useServerStore } from "../../store/serverStore";
import { useTerminalStore } from "../../store/terminalStore";
import { useBroadcastStore } from "../../store/broadcastStore";
import { formatError } from "../../lib/errors";
import Button from "../shared/Button";

const MAX_BROADCAST_HOSTS = 9;

export default function BulkActionBar() {
  const bulkSelected = useUiStore((s) => s.bulkSelected);
  const clearSelected = useUiStore((s) => s.clearSelected);
  const toggleBulkMode = useUiStore((s) => s.toggleBulkMode);
  const selectAll = useUiStore((s) => s.selectAll);
  const servers = useServerStore((s) => s.servers);
  const groups = useServerStore((s) => s.groups);
  const deleteServer = useServerStore((s) => s.deleteServer);
  const moveServerGroup = useServerStore((s) => s.moveServerGroup);
  const openTerminalSession = useTerminalStore((s) => s.openSession);
  const createBroadcastGroup = useBroadcastStore((s) => s.createGroup);

  const [connectingGroup, setConnectingGroup] = useState(false);
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

  const handleConnectAsGroup = async () => {
    setBusy(true);
    setConnectingGroup(true);
    setError(null);
    try {
      const targets = bulkSelected
        .map((id) => servers.find((s) => s.id === id))
        .filter((s): s is NonNullable<typeof s> => !!s)
        .slice(0, MAX_BROADCAST_HOSTS);

      const sessionIds: string[] = [];
      for (const target of targets) {
        const sessionId = await openTerminalSession(target.id, target.displayName);
        if (sessionId) sessionIds.push(sessionId);
      }

      if (sessionIds.length > 0) {
        const name = targets.length === 1 ? targets[0].displayName : `${targets.length} servers`;
        createBroadcastGroup(name, sessionIds);
        toggleBulkMode();
      } else {
        setError("Could not open any terminal sessions");
      }
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
      setConnectingGroup(false);
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

        {/* Connect as broadcast group */}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => { void handleConnectAsGroup(); }}
          disabled={busy || count === 0}
          title={count > MAX_BROADCAST_HOSTS ? `Opens the first ${MAX_BROADCAST_HOSTS} selected servers` : undefined}
        >
          {connectingGroup ? "Connecting…" : `Connect as group${count > 0 ? ` (${Math.min(count, MAX_BROADCAST_HOSTS)})` : ""}`}
        </Button>

        {/* Move to group */}
        <div className="relative">
          <Button
            size="sm"
            variant="primary"
            onClick={() => setShowGroupPicker((v) => !v)}
            disabled={busy || count === 0}
          >
            Add to Group
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
        <Button
          size="sm"
          variant="delete"
          onClick={() => setConfirmDelete(true)}
          disabled={busy || count === 0}
        >
          Delete {count > 0 ? count : ""}
        </Button>
      </div>

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85"
          onClick={() => setConfirmDelete(false)}
        >
          <div
            className="bg-surface-2 border border-stroke rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-1">
              <h2 className="text-white font-semibold text-base">
                Delete {count} server{count !== 1 ? "s" : ""}?
              </h2>
              <p className="text-muted text-sm">
                {count === 1
                  ? "This server will be permanently removed."
                  : `All ${count} selected servers will be permanently removed.`}{" "}
                This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={busy}
                className="px-4 py-2 text-sm text-muted hover:text-white bg-surface-3 hover:bg-surface-4 rounded transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleDeleteAll(); }}
                disabled={busy}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 rounded transition-colors disabled:opacity-40"
              >
                {busy ? "Deleting…" : `Delete ${count}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
