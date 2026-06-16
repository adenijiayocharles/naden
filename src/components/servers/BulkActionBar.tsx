import { useState } from "react";
import { useUiStore } from "../../store/uiStore";
import { useServerStore } from "../../store/serverStore";
import { useTerminalStore } from "../../store/terminalStore";
import { useBroadcastStore } from "../../store/broadcastStore";
import { formatError } from "../../lib/errors";
import { Button } from "../ui/button";
import ConfirmDeleteModal from "../shared/ConfirmDeleteModal";

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
        const serverIds = targets.map((t) => t.id);
        await createBroadcastGroup(name, sessionIds, serverIds);
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

      <Button variant="ghost" onClick={handleSelectAll} disabled={busy} className="h-8">
        Select all
      </Button>

      <Button variant="ghost" onClick={clearSelected} disabled={busy || count === 0} className="h-8">
        Clear
      </Button>

      <div className="ml-auto flex items-center gap-2 relative">
        {error && <span className="text-sm text-error max-w-xs truncate">{error}</span>}

        {/* Connect as broadcast group */}
        <Button
          variant="ghost"
          onClick={() => { void handleConnectAsGroup(); }}
          disabled={busy || count === 0}
          title={count > MAX_BROADCAST_HOSTS ? `Opens the first ${MAX_BROADCAST_HOSTS} selected servers` : undefined}
          className="h-8"
        >
          {connectingGroup ? "Connecting…" : `Connect as group${count > 0 ? ` (${Math.min(count, MAX_BROADCAST_HOSTS)})` : ""}`}
        </Button>

        {/* Move to group */}
        <div className="relative">
          <Button
            onClick={() => setShowGroupPicker((v) => !v)}
            disabled={busy || count === 0}
            className="h-8"
          >
            Add to Group
          </Button>

          {showGroupPicker && (
            <div className="absolute bottom-full mb-1 right-0 bg-surface-2 border border-stroke rounded-lg shadow-overlay min-w-[160px] py-1 z-30">
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
          variant="delete"
          onClick={() => setConfirmDelete(true)}
          disabled={busy || count === 0}
          className="h-8"
        >
          Delete {count > 0 ? count : ""}
        </Button>
      </div>

      {confirmDelete && (
        <ConfirmDeleteModal
          title={`Delete ${count} server${count !== 1 ? "s" : ""}?`}
          description={count === 1 ? "This server will be permanently removed. This cannot be undone." : `All ${count} selected servers will be permanently removed. This cannot be undone.`}
          confirmLabel={`Delete ${count}`}
          busy={busy}
          onConfirm={() => { void handleDeleteAll(); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
