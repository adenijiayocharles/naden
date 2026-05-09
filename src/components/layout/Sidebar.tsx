import { useState } from "react";
import { useServerStore } from "../../store/serverStore";
import { useUiStore } from "../../store/uiStore";
import VaultCountdown from "./VaultCountdown";
import { formatError } from "../../lib/errors";
import type { Group } from "../../types/server";

const ClockIcon = () => (
  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

function GroupEditModal({ group, onClose }: { group: Group; onClose: () => void }) {
  const updateGroup = useServerStore((s) => s.updateGroup);
  const deleteGroup = useServerStore((s) => s.deleteGroup);
  const setFilterGroup = useUiStore((s) => s.setFilterGroup);
  const filterGroupId = useUiStore((s) => s.filterGroupId);
  const [name, setName] = useState(group.name);
  const [color, setColor] = useState(group.color ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const COLORS = ["#e53e3e","#ed8936","#ecc94b","#48bb78","#38b2ac","#4299e1","#667eea","#ed64a6","#a0aec0"];

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

  const handleDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteGroup(group.id);
      if (filterGroupId === group.id) setFilterGroup(null);
      onClose();
    } catch (e) {
      setError(formatError(e));
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-1 border border-stroke-subtle rounded-xl shadow-2xl w-full max-w-sm p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Edit Group</h3>

        <div className="space-y-3">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group name"
            className="w-full bg-surface-3 border border-stroke rounded px-3 py-2 text-sm text-white placeholder-faint focus:outline-none focus:border-accent"
          />

          <div>
            <p className="text-xs text-faint mb-2">Color</p>
            <div className="flex items-center gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-5 h-5 rounded-full transition-transform ${color === c ? "scale-125 ring-2 ring-white/30" : "hover:scale-110"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <button
                onClick={() => setColor("")}
                className={`w-5 h-5 rounded-full border transition-transform ${!color ? "scale-125 ring-2 ring-white/30 border-white/30" : "border-[#444] hover:scale-110"}`}
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex items-center gap-2 mt-5">
          {confirmDelete ? (
            <>
              <span className="text-xs text-red-400 flex-1">Delete group and ungroup servers?</span>
              <button onClick={() => { void handleDelete(); }} disabled={busy} className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-500 text-white rounded transition-colors disabled:opacity-40">Confirm</button>
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 text-xs text-faint hover:text-white transition-colors">Cancel</button>
            </>
          ) : (
            <>
              <button onClick={() => setConfirmDelete(true)} disabled={busy} className="text-xs text-red-500 hover:text-red-400 transition-colors mr-auto disabled:opacity-40">Delete</button>
              <button onClick={onClose} className="px-3 py-1.5 text-xs text-faint hover:text-white bg-surface-3 rounded transition-colors">Cancel</button>
              <button onClick={() => { void handleSave(); }} disabled={busy || !name.trim()} className="px-3 py-1.5 text-xs text-black bg-accent hover:bg-accent-hover rounded font-semibold transition-colors disabled:opacity-40">
                {busy ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const servers = useServerStore((s) => s.servers);
  const groups = useServerStore((s) => s.groups);
  const tags = useServerStore((s) => s.tags);
  const { filterGroupId, filterTagId, filterFavourites, setFilterGroup, setFilterTag, setFilterFavourites, activeView, openAudit, closeForm } = useUiStore();
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);

  const selectFilter = (fn: () => void) => () => {
    if (activeView === "audit") closeForm();
    fn();
  };

  const favouriteCount = servers.filter((s) => s.isFavourite).length;

  const countByGroup = groups.reduce<Record<string, number>>((acc, g) => {
    acc[g.id] = servers.filter((s) => s.groupId === g.id).length;
    return acc;
  }, {});

  const countByTag = tags.reduce<Record<string, number>>((acc, t) => {
    acc[t.id] = servers.filter((s) => s.tags.some((st) => st.id === t.id)).length;
    return acc;
  }, {});

  const navItem = (
    active: boolean,
    onClick: () => void,
    label: React.ReactNode,
    count?: number,
  ) => (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded text-sm flex items-center justify-between transition-colors ${
        active
          ? "bg-accent text-black font-medium"
          : "text-secondary hover:bg-surface-3 hover:text-white"
      }`}
    >
      <span className="truncate">{label}</span>
      {count !== undefined && (
        <span className={`text-xs ml-2 shrink-0 ${active ? "text-black/60" : "text-muted"}`}>
          {count}
        </span>
      )}
    </button>
  );

  return (
    <aside className="w-60 shrink-0 bg-surface-0 border-r border-stroke-subtle flex flex-col overflow-y-auto">
      <div className="h-14 flex items-center px-4 border-b border-stroke-subtle shrink-0">
        <span className="font-bold text-white text-base tracking-tight">
          SSH Manager
        </span>
      </div>

      <nav className="flex-1 p-2 space-y-0.5">
        {navItem(
          !filterGroupId && !filterTagId && !filterFavourites && activeView !== "audit",
          selectFilter(() => { setFilterGroup(null); setFilterTag(null); setFilterFavourites(false); }),
          "All Servers",
          servers.length,
        )}

        {navItem(
          filterFavourites && activeView !== "audit",
          selectFilter(() => setFilterFavourites(!filterFavourites)),
          <span className="flex items-center gap-2">
            <svg className={`w-3.5 h-3.5 shrink-0 ${filterFavourites ? "fill-yellow-400 text-yellow-400" : "fill-none text-muted"}`} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
            Favourites
          </span>,
          favouriteCount,
        )}

        {groups.length > 0 && (
          <div className="pt-3">
            <p className="px-3 pb-1 text-xs font-semibold text-faint uppercase tracking-wider">
              Groups
            </p>
            {groups.map((g) => (
              <div key={g.id} className="group/item flex items-center">
                <button
                  onClick={selectFilter(() => setFilterGroup(g.id))}
                  className={`flex-1 text-left px-3 py-2 rounded-l text-sm flex items-center justify-between transition-colors min-w-0 ${
                    filterGroupId === g.id && activeView !== "audit"
                      ? "bg-accent text-black font-medium"
                      : "text-secondary hover:bg-surface-3 hover:text-white"
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0 truncate">
                    {g.color && (
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                    )}
                    <span className="truncate">{g.name}</span>
                  </span>
                  <span className={`text-xs ml-2 shrink-0 ${filterGroupId === g.id && activeView !== "audit" ? "text-black/60" : "text-muted"}`}>
                    {countByGroup[g.id] ?? 0}
                  </span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingGroup(g); }}
                  className={`px-1.5 py-2 rounded-r opacity-0 group-hover/item:opacity-100 transition-opacity ${
                    filterGroupId === g.id && activeView !== "audit"
                      ? "text-black/50 hover:text-black"
                      : "text-dim hover:text-secondary hover:bg-surface-3"
                  }`}
                  title="Edit group"
                  aria-label={`Edit ${g.name}`}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 1.5l2 2-6 6H2.5v-2l6-6z" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {tags.length > 0 && (
          <div className="pt-3">
            <p className="px-3 pb-1 text-xs font-semibold text-faint uppercase tracking-wider">
              Tags
            </p>
            {tags.map((t) =>
              navItem(
                filterTagId === t.id && activeView !== "audit",
                selectFilter(() => setFilterTag(t.id)),
                `#${t.name}`,
                countByTag[t.id] ?? 0,
              ),
            )}
          </div>
        )}
      </nav>
      {/* Vault auto-lock countdown */}
      <VaultCountdown />
      {/* Audit log link pinned to the bottom */}
      <div className="p-2 border-t border-stroke-subtle shrink-0">
        <button
          onClick={() => { if (activeView === "audit") { closeForm(); } else { openAudit(); } }}
          className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${
            activeView === "audit"
              ? "bg-accent text-black font-medium"
              : "text-muted hover:bg-surface-3 hover:text-white"
          }`}
        >
          <ClockIcon />
          Audit Log
        </button>
      </div>

      {editingGroup && (
        <GroupEditModal group={editingGroup} onClose={() => setEditingGroup(null)} />
      )}
    </aside>
  );
}
