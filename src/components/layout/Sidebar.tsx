import { useState, useRef, useEffect } from "react";
import { useServerStore } from "../../store/serverStore";
import { useUiStore } from "../../store/uiStore";
import { useTerminalStore } from "../../store/terminalStore";
import { useSftpStore } from "../../store/sftpStore";
import VaultCountdown from "./VaultCountdown";
import SshConfigImport from "../servers/SshConfigImport";
import { formatError } from "../../lib/errors";
import type { Group, Tag } from "../../types/server";

// ── Shared colours ─────────────────────────────────────────────────────────────
const COLORS = ["#e53e3e","#ed8936","#ecc94b","#48bb78","#38b2ac","#4299e1","#667eea","#ed64a6","#a0aec0"];

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
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
        className={`w-5 h-5 rounded-full border transition-transform ${!value ? "scale-125 ring-2 ring-white/30 border-white/30" : "border-[#444] hover:scale-110"}`}
      />
    </div>
  );
}

// ── Group modals ───────────────────────────────────────────────────────────────
function GroupCreateModal({ onClose }: { onClose: () => void }) {
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface-1 border border-stroke-subtle rounded-xl shadow-2xl w-full max-w-sm p-5">
        <h3 className="text-sm font-semibold text-white mb-4">New Group</h3>
        <div className="space-y-3">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) void handleCreate(); }}
            placeholder="Group name"
            className="w-full h-8 bg-surface-3 border border-stroke rounded px-3 text-sm text-white placeholder-faint focus:outline-none focus:border-accent" />
          <div>
            <p className="text-xs text-faint mb-2">Color</p>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-faint hover:text-white bg-surface-3 rounded transition-colors">Cancel</button>
          <button onClick={() => { void handleCreate(); }} disabled={busy || !name.trim()}
            className="px-3 py-1.5 text-xs text-black bg-accent hover:bg-accent-hover rounded font-semibold transition-colors disabled:opacity-40">
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function GroupEditModal({ group, onClose, initialDelete = false }: { group: Group; onClose: () => void; initialDelete?: boolean }) {
  const updateGroup = useServerStore((s) => s.updateGroup);
  const deleteGroup = useServerStore((s) => s.deleteGroup);
  const setFilterGroup = useUiStore((s) => s.setFilterGroup);
  const filterGroupId = useUiStore((s) => s.filterGroupId);
  const [name, setName] = useState(group.name);
  const [color, setColor] = useState(group.color ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(initialDelete);

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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface-1 border border-stroke-subtle rounded-xl shadow-2xl w-full max-w-sm p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Edit Group</h3>
        <div className="space-y-3">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Group name"
            className="w-full h-8 bg-surface-3 border border-stroke rounded px-3 text-sm text-white placeholder-faint focus:outline-none focus:border-accent" />
          <div>
            <p className="text-xs text-faint mb-2">Color</p>
            <ColorPicker value={color} onChange={setColor} />
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
              <button onClick={() => { void handleSave(); }} disabled={busy || !name.trim()}
                className="px-3 py-1.5 text-xs text-black bg-accent hover:bg-accent-hover rounded font-semibold transition-colors disabled:opacity-40">
                {busy ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tag rename modal ───────────────────────────────────────────────────────────
function TagRenameModal({ tag, onClose }: { tag: Tag; onClose: () => void }) {
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface-1 border border-stroke-subtle rounded-xl shadow-2xl w-full max-w-sm p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Rename Tag</h3>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); if (e.key === "Escape") onClose(); }}
          placeholder="Tag name"
          className="w-full h-8 bg-surface-3 border border-stroke rounded px-3 text-sm text-white placeholder-faint focus:outline-none focus:border-accent" />
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        <div className="flex items-center justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-faint hover:text-white bg-surface-3 rounded transition-colors">Cancel</button>
          <button onClick={() => { void handleSave(); }} disabled={busy || !name.trim()}
            className="px-3 py-1.5 text-xs text-black bg-accent hover:bg-accent-hover rounded font-semibold transition-colors disabled:opacity-40">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Shared nav row with optional context menu ──────────────────────────────────
interface MenuAction { label: string; danger?: boolean; onClick: () => void }

function NavRow({
  active,
  onClick,
  label,
  count,
  menuActions,
}: {
  active: boolean;
  onClick: () => void;
  label: React.ReactNode;
  count?: number;
  menuActions?: MenuAction[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasMenu = menuActions && menuActions.length > 0;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const activeBtn = active ? "bg-accent text-black font-medium" : "text-secondary hover:bg-surface-3 hover:text-white";
  const activeMenu = active ? "text-black/50 hover:text-black" : "text-dim hover:text-secondary hover:bg-surface-3";

  return (
    <div className="relative group/row flex items-center">
      <button
        onClick={onClick}
        className={`flex-1 min-w-0 text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${
          hasMenu ? "rounded-l" : "rounded"
        } ${activeBtn}`}
      >
        <span className="truncate">{label}</span>
        {count !== undefined && (
          <span className={`text-xs ml-2 shrink-0 ${active ? "text-black/60" : "text-muted"}`}>{count}</span>
        )}
      </button>

      {hasMenu && (
        <div ref={menuRef} className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            className={`px-1.5 py-2 rounded-r transition-opacity ${
              menuOpen ? "opacity-100" : "opacity-0 group-hover/row:opacity-100"
            } ${activeMenu}`}
            aria-label="More options"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
              <circle cx="8" cy="3" r="1.3" />
              <circle cx="8" cy="8" r="1.3" />
              <circle cx="8" cy="13" r="1.3" />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-8 bg-surface-2 border border-stroke rounded-lg shadow-2xl z-30 min-w-[130px] py-1">
              {menuActions!.map((action) => (
                <button
                  key={action.label}
                  onClick={() => { action.onClick(); setMenuOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-surface-4 ${
                    action.danger ? "text-red-400 hover:text-red-300" : "text-secondary hover:text-white"
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────────
export default function Sidebar() {
  const servers = useServerStore((s) => s.servers);
  const groups = useServerStore((s) => s.groups);
  const tags = useServerStore((s) => s.tags);
  const deleteTag = useServerStore((s) => s.deleteTag);
  const {
    filterGroupId, filterTagId, filterFavourites,
    setFilterGroup, setFilterTag, setFilterFavourites,
    activeView, openAdd, closeForm, expandServerList,
  } = useUiStore();

  const terminalSessions = useTerminalStore((s) => s.sessions);
  const sftpSessions = useSftpStore((s) => s.sessions);
  const activeSessions = [...terminalSessions, ...sftpSessions].filter(
    (s) => s.status === "connected",
  ).length;

  const [editingGroup, setEditingGroup] = useState<{ group: Group; initialDelete: boolean } | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [renamingTag, setRenamingTag] = useState<Tag | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!addMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [addMenuOpen]);

  const selectFilter = (fn: () => void) => () => {
    if (activeView === "logs") closeForm();
    expandServerList();
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

  return (
    <aside className="w-60 shrink-0 bg-surface-0 border-r border-stroke-subtle flex flex-col overflow-y-auto">
      <nav className="flex-1 p-2 space-y-0.5">
        {/* All Servers */}
        <NavRow
          active={!filterGroupId && !filterTagId && !filterFavourites && activeView !== "logs"}
          onClick={selectFilter(() => { setFilterGroup(null); setFilterTag(null); setFilterFavourites(false); })}
          label="All Servers"
          count={servers.length}
        />

        {/* Favourites */}
        <NavRow
          active={filterFavourites && activeView !== "logs"}
          onClick={selectFilter(() => setFilterFavourites(!filterFavourites))}
          label={
            <span className="flex items-center gap-2">
              <svg className={`w-3.5 h-3.5 shrink-0 ${filterFavourites ? "fill-yellow-400 text-yellow-400" : "fill-none text-muted"}`} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
              Favourites
            </span>
          }
          count={favouriteCount}
        />

        {/* Groups */}
        <div className="pt-3">
          <div className="flex items-center justify-between px-3 pb-1">
            <p className="text-xs font-semibold text-faint uppercase tracking-wider">Groups</p>
            <button
              onClick={() => setCreatingGroup(true)}
              className="text-dim hover:text-muted transition-colors"
              title="New group" aria-label="New group"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 14 14" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                <line x1="7" y1="2" x2="7" y2="12" />
                <line x1="2" y1="7" x2="12" y2="7" />
              </svg>
            </button>
          </div>
          {groups.map((g) => (
            <NavRow
              key={g.id}
              active={filterGroupId === g.id && activeView !== "logs"}
              onClick={selectFilter(() => setFilterGroup(g.id))}
              label={
                <span className="flex items-center gap-2 min-w-0 truncate">
                  {g.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />}
                  <span className="truncate">{g.name}</span>
                </span>
              }
              count={countByGroup[g.id] ?? 0}
              menuActions={[
                { label: "Edit", onClick: () => setEditingGroup({ group: g, initialDelete: false }) },
                { label: "Delete", danger: true, onClick: () => setEditingGroup({ group: g, initialDelete: true }) },
              ]}
            />
          ))}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="pt-3">
            <p className="px-3 pb-1 text-xs font-semibold text-faint uppercase tracking-wider">Tags</p>
            {tags.map((t) => (
              <NavRow
                key={t.id}
                active={filterTagId === t.id && activeView !== "logs"}
                onClick={selectFilter(() => setFilterTag(t.id))}
                label={`#${t.name}`}
                count={countByTag[t.id] ?? 0}
                menuActions={[
                  { label: "Rename", onClick: () => setRenamingTag(t) },
                  {
                    label: "Delete", danger: true, onClick: () => {
                      void deleteTag(t.id);
                      if (filterTagId === t.id) setFilterTag(null);
                    },
                  },
                ]}
              />
            ))}
          </div>
        )}
      </nav>

      <VaultCountdown />

      {/* Status bar */}
      <div className="px-3 py-2.5 border-t border-stroke-subtle shrink-0 flex items-center gap-2">
        <span className="flex-1 text-xs text-dim">
          {servers.length} {servers.length === 1 ? "server" : "servers"}
          {activeSessions > 0 && (
            <> · <span className="text-accent-fg">{activeSessions} active</span></>
          )}
        </span>
        <div ref={addMenuRef} className="relative shrink-0">
          <button
            onClick={() => setAddMenuOpen((v) => !v)}
            className="text-xs font-medium text-secondary hover:text-white border border-stroke hover:border-stroke-subtle bg-surface-2 hover:bg-surface-3 px-4 py-1.5 rounded transition-colors"
          >
            + Add
          </button>
          {addMenuOpen && (
            <div className="absolute bottom-full right-0 mb-1.5 bg-surface-2 border border-stroke rounded-lg shadow-2xl py-1 min-w-[160px] z-50">
              <button
                onClick={() => { openAdd(); setAddMenuOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-secondary hover:text-white hover:bg-surface-4 transition-colors"
              >
                Manually
              </button>
              <button
                onClick={() => { setShowImport(true); setAddMenuOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-secondary hover:text-white hover:bg-surface-4 transition-colors"
              >
                SSH Config
              </button>
            </div>
          )}
        </div>
      </div>

      {showImport && <SshConfigImport onClose={() => setShowImport(false)} />}
      {editingGroup && <GroupEditModal group={editingGroup.group} initialDelete={editingGroup.initialDelete} onClose={() => setEditingGroup(null)} />}
      {creatingGroup && <GroupCreateModal onClose={() => setCreatingGroup(false)} />}
      {renamingTag && <TagRenameModal tag={renamingTag} onClose={() => setRenamingTag(null)} />}
    </aside>
  );
}
