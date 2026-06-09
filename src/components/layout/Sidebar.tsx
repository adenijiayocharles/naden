import { useState, useRef, useEffect, useMemo } from "react";
import { useServerStore } from "../../store/serverStore";
import { useSnippetStore } from "../../store/snippetStore";
import { usePlaybookStore } from "../../store/playbookStore";
import { useUiStore } from "../../store/uiStore";
import Input from "../shared/Input";
import Button from "../shared/Button";
import ConfirmDeleteModal from "../shared/ConfirmDeleteModal";
import { useTerminalStore } from "../../store/terminalStore";
import { useSftpStore } from "../../store/sftpStore";
import { useTunnelStore } from "../../store/tunnelStore";
import VaultCountdown from "./VaultCountdown";
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
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 mt-5">
          <Button size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary" onClick={() => { void handleCreate(); }} disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function GroupEditModal({ group, onClose, onDelete }: { group: Group; onClose: () => void; onDelete: () => void }) {
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
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex items-center gap-2 mt-5">
          <Button size="sm" variant="ghost" onClick={onDelete} disabled={busy} className="text-red-500 hover:text-red-400 mr-auto px-0">Delete</Button>
          <Button size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary" onClick={() => { void handleSave(); }} disabled={busy || !name.trim()}>
            {busy ? "Saving…" : "Save"}
          </Button>
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-backdrop-in flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface-1/80 backdrop-blur-2xl border border-stroke-subtle rounded-xl shadow-overlay animate-overlay-in w-full max-w-sm p-5">
        <h3 className="text-title text-white mb-4">Rename Tag</h3>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); if (e.key === "Escape") onClose(); }}
          placeholder="Tag name" />
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        <div className="flex items-center justify-end gap-2 mt-5">
          <Button size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary" onClick={() => { void handleSave(); }} disabled={busy || !name.trim()}>
            {busy ? "Saving…" : "Save"}
          </Button>
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
            <div className="absolute right-0 top-8 bg-surface-2 border border-stroke rounded-lg shadow-overlay z-30 min-w-[130px] py-1">
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

// ── Group row with right-click context menu ────────────────────────────────────
function GroupRow({
  group,
  active,
  count,
  onClick,
  onEdit,
  onDelete,
}: {
  group: Group;
  active: boolean;
  count: number;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div
        onContextMenu={handleContextMenu}
        className={`flex items-center rounded transition-colors ${active ? "bg-accent" : "hover:bg-surface-3"}`}
      >
        <button
          onClick={onClick}
          className={`flex-1 min-w-0 text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${
            active ? "text-black font-medium" : "text-secondary hover:text-white"
          }`}
        >
          <span className="flex items-center gap-2 min-w-0 truncate">
            {group.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: group.color }} />}
            <span className="truncate">{group.name}</span>
          </span>
          <span className={`text-xs ml-2 shrink-0 ${active ? "text-black/60" : "text-muted"}`}>{count}</span>
        </button>
      </div>

      {menu && (
        <div
          ref={menuRef}
          className="fixed bg-surface-2 border border-stroke rounded-lg shadow-overlay z-50 py-1 min-w-[130px]"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            onClick={() => { onEdit(); setMenu(null); }}
            className="w-full text-left px-3 py-2 text-sm text-secondary hover:text-white hover:bg-surface-4 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => { onDelete(); setMenu(null); }}
            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-surface-4 transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </>
  );
}

// ── Tag row with right-click context menu ─────────────────────────────────────
function TagRow({
  tag,
  active,
  count,
  onClick,
  onRename,
  onDelete,
}: {
  tag: Tag;
  active: boolean;
  count: number;
  onClick: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menu]);

  return (
    <>
      <button
        onClick={onClick}
        onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}
        className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between rounded transition-colors ${
          active ? "bg-accent text-black font-medium" : "text-secondary hover:bg-surface-3 hover:text-white"
        }`}
      >
        <span className="truncate">#{tag.name}</span>
        <span className={`text-xs ml-2 shrink-0 ${active ? "text-black/60" : "text-muted"}`}>{count}</span>
      </button>

      {menu && (
        <div
          ref={menuRef}
          className="fixed bg-surface-2 border border-stroke rounded-lg shadow-overlay z-50 py-1 min-w-[130px]"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            onClick={() => { onRename(); setMenu(null); }}
            className="w-full text-left px-3 py-2 text-sm text-secondary hover:text-white hover:bg-surface-4 transition-colors"
          >
            Rename
          </button>
          <button
            onClick={() => { onDelete(); setMenu(null); }}
            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-surface-4 transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────────
export default function Sidebar() {
  const servers = useServerStore((s) => s.servers);
  const groups = useServerStore((s) => s.groups);
  const tags = useServerStore((s) => s.tags);
  const deleteTag = useServerStore((s) => s.deleteTag);
  const deleteGroup = useServerStore((s) => s.deleteGroup);
  const {
    filterGroupId, filterTagId, filterFavourites,
    setFilterGroup, setFilterTag, setFilterFavourites,
    activeView, openAdd, closeForm, expandServerList, openImportSshConfig, openSnippets,
    openPlaybooks, openTunnels, openSettings,
  } = useUiStore();

  const snippetCount = useSnippetStore((s) => s.snippets.length);
  const playbookCount = usePlaybookStore((s) => s.playbooks.length);

  const terminalSessions = useTerminalStore((s) => s.sessions);
  const sftpSessions = useSftpStore((s) => s.sessions);
  const activeSessions = [...terminalSessions, ...sftpSessions].filter(
    (s) => s.status === "connected",
  ).length;

  const tunnelStatuses = useTunnelStore((s) => s.statuses);
  const activeTunnels = Object.values(tunnelStatuses).filter((s) => s === "active").length;

  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState<Group | null>(null);
  const [confirmDeleteTag, setConfirmDeleteTag] = useState<Tag | null>(null);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [deletingTag, setDeletingTag] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [renamingTag, setRenamingTag] = useState<Tag | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [tagsCollapsed, setTagsCollapsed] = useState(false);
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

  const handleConfirmDeleteGroup = async () => {
    if (!confirmDeleteGroup) return;
    setDeletingGroup(true);
    try {
      await deleteGroup(confirmDeleteGroup.id);
      if (filterGroupId === confirmDeleteGroup.id) setFilterGroup(null);
      setConfirmDeleteGroup(null);
    } finally {
      setDeletingGroup(false);
    }
  };

  const handleConfirmDeleteTag = async () => {
    if (!confirmDeleteTag) return;
    setDeletingTag(true);
    try {
      await deleteTag(confirmDeleteTag.id);
      if (filterTagId === confirmDeleteTag.id) setFilterTag(null);
      setConfirmDeleteTag(null);
    } finally {
      setDeletingTag(false);
    }
  };

  const selectFilter = (fn: () => void) => () => {
    if (activeView === "logs" || activeView === "snippets" || activeView === "playbooks" || activeView === "tunnels" || activeView === "settings") closeForm();
    expandServerList();
    fn();
  };

  const favouriteCount = useMemo(
    () => servers.filter((s) => s.isFavourite).length,
    [servers],
  );
  const countByGroup = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of servers) { if (s.groupId) counts[s.groupId] = (counts[s.groupId] ?? 0) + 1; }
    return counts;
  }, [servers]);
  const countByTag = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of servers) { for (const t of s.tags) counts[t.id] = (counts[t.id] ?? 0) + 1; }
    return counts;
  }, [servers]);

  return (
    <aside className="w-60 shrink-0 bg-surface-0 border-r border-stroke-subtle flex flex-col">
      <nav className="flex-1 min-h-0 overflow-y-auto p-2 space-y-0.5">
        {/* All Servers */}
        <NavRow
          active={!filterGroupId && !filterTagId && !filterFavourites && activeView !== "logs" && activeView !== "snippets" && activeView !== "playbooks" && activeView !== "tunnels"}
          onClick={selectFilter(() => { setFilterGroup(null); setFilterTag(null); setFilterFavourites(false); })}
          label={
            <span className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 shrink-0 text-muted" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="3" width="14" height="9" rx="1.5" />
                <line x1="5" y1="12" x2="5" y2="14" />
                <line x1="11" y1="12" x2="11" y2="14" />
                <line x1="3" y1="14" x2="13" y2="14" />
                <circle cx="8" cy="7.5" r="1" fill="currentColor" stroke="none" />
              </svg>
              All Servers
            </span>
          }
          count={servers.length}
        />

        {/* Snippets */}
        <NavRow
          active={activeView === "snippets"}
          onClick={() => openSnippets()}
          count={snippetCount}
          label={
            <span className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 shrink-0 text-muted" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="12" height="12" rx="2" />
                <line x1="5" y1="5.5" x2="11" y2="5.5" />
                <line x1="5" y1="8" x2="11" y2="8" />
                <line x1="5" y1="10.5" x2="8" y2="10.5" />
              </svg>
              Snippets
            </span>
          }
        />

        {/* Playbooks */}
        <NavRow
          active={activeView === "playbooks"}
          onClick={() => openPlaybooks()}
          count={playbookCount}
          label={
            <span className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 shrink-0 text-muted" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="2" width="10" height="12" rx="1.5" />
                <line x1="6" y1="5.5" x2="10" y2="5.5" />
                <line x1="6" y1="8" x2="10" y2="8" />
                <line x1="6" y1="10.5" x2="8.5" y2="10.5" />
              </svg>
              Playbooks
            </span>
          }
        />

        {/* Tunnels */}
        <NavRow
          active={activeView === "tunnels"}
          onClick={() => openTunnels()}
          count={activeTunnels > 0 ? activeTunnels : undefined}
          label={
            <span className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 shrink-0 text-muted" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 8h4M10 8h4M6 5l-2 3 2 3M10 5l2 3-2 3" />
              </svg>
              Tunnels
            </span>
          }
        />

        {/* Favourites */}
        <NavRow
          active={filterFavourites && activeView !== "logs" && activeView !== "snippets" && activeView !== "playbooks" && activeView !== "tunnels"}
          onClick={selectFilter(() => setFilterFavourites(!filterFavourites))}
          label={
            <span className="flex items-center gap-2">
              <svg className={`w-3.5 h-3.5 shrink-0 ${filterFavourites ? "fill-yellow-400 text-yellow-400" : "fill-none text-muted"}`} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
              Favourites
            </span>
          }
          count={favouriteCount}
        />

        {/* Groups */}
        <div className="pt-3">
          <div className="flex items-center justify-between px-3 pb-2">
            <span className="text-xs font-semibold text-faint uppercase tracking-wider">Groups</span>
            <button
              onClick={() => setCreatingGroup(true)}
              className="flex items-center p-0 text-dim hover:text-muted transition-colors"
              title="New group" aria-label="New group"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 14 14" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
                <line x1="7" y1="2" x2="7" y2="12" />
                <line x1="2" y1="7" x2="12" y2="7" />
              </svg>
            </button>
          </div>
          {groups.map((g) => (
            <GroupRow
              key={g.id}
              group={g}
              active={filterGroupId === g.id && activeView !== "logs" && activeView !== "snippets" && activeView !== "playbooks" && activeView !== "tunnels"}
              count={countByGroup[g.id] ?? 0}
              onClick={selectFilter(() => setFilterGroup(g.id))}
              onEdit={() => setEditingGroup(g)}
              onDelete={() => setConfirmDeleteGroup(g)}
            />
          ))}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="pt-3">
            <button
              onClick={() => setTagsCollapsed((v) => !v)}
              className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-1 w-full text-left px-3 select-none text-faint hover:text-muted transition-colors"
            >
              <svg
                className={`w-2.5 h-2.5 shrink-0 transition-transform ${tagsCollapsed ? "" : "rotate-90"}`}
                fill="none" viewBox="0 0 6 10" stroke="currentColor" strokeWidth={1.5}
                strokeLinecap="round" strokeLinejoin="round"
              >
                <polyline points="1,1 5,5 1,9" />
              </svg>
              Tags
            </button>
            {!tagsCollapsed && tags.map((t) => (
              <TagRow
                key={t.id}
                tag={t}
                active={filterTagId === t.id && activeView !== "logs" && activeView !== "snippets" && activeView !== "playbooks" && activeView !== "tunnels"}
                count={countByTag[t.id] ?? 0}
                onClick={selectFilter(() => setFilterTag(t.id))}
                onRename={() => setRenamingTag(t)}
                onDelete={() => setConfirmDeleteTag(t)}
              />
            ))}
          </div>
        )}

      </nav>

      <VaultCountdown />

      {/* Settings */}
      <div className="px-2 pb-1 border-t border-stroke-subtle pt-1">
        <NavRow
          active={activeView === "settings"}
          onClick={() => openSettings()}
          label={
            <span className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 shrink-0 text-muted" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="2.5" />
                <path d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M3.4 12.6l.7-.7M11.9 4.1l.7-.7" />
              </svg>
              Settings
            </span>
          }
        />
      </div>

      {/* Status bar */}
      <div className="px-3 py-2.5 border-t border-stroke-subtle shrink-0 flex items-center gap-2">
        <span className="flex-1 text-meta text-dim">
          {servers.length} {servers.length === 1 ? "server" : "servers"}
          {activeSessions > 0 && (
            <> · <span className="text-secondary">{activeSessions} active</span></>
          )}
        </span>
        <div ref={addMenuRef} className="relative shrink-0">
          <Button
            size="sm"
            variant="primary"
            onClick={() => setAddMenuOpen((v) => !v)}

          >
            + Add
          </Button>
          {addMenuOpen && (
            <div className="absolute bottom-full right-0 mb-1.5 bg-surface-2/80 backdrop-blur-xl border border-stroke rounded-lg shadow-overlay py-1 min-w-[160px] z-50">
              <button
                onClick={() => { openAdd(); setAddMenuOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-secondary hover:text-white hover:bg-surface-4 transition-colors"
              >
                Manually
              </button>
              <button
                onClick={() => { openImportSshConfig(); setAddMenuOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-secondary hover:text-white hover:bg-surface-4 transition-colors"
              >
                SSH Config
              </button>
            </div>
          )}
        </div>
      </div>

      {editingGroup && (
        <GroupEditModal
          group={editingGroup}
          onClose={() => setEditingGroup(null)}
          onDelete={() => { setEditingGroup(null); setConfirmDeleteGroup(editingGroup); }}
        />
      )}
      {confirmDeleteGroup && (
        <ConfirmDeleteModal
          title="Delete group?"
          description="Servers in this group will be ungrouped. This cannot be undone."
          busy={deletingGroup}
          onConfirm={() => { void handleConfirmDeleteGroup(); }}
          onCancel={() => setConfirmDeleteGroup(null)}
        />
      )}
      {confirmDeleteTag && (
        <ConfirmDeleteModal
          title={`Delete tag "#${confirmDeleteTag.name}"?`}
          description="This tag will be removed from all servers. This cannot be undone."
          busy={deletingTag}
          onConfirm={() => { void handleConfirmDeleteTag(); }}
          onCancel={() => setConfirmDeleteTag(null)}
        />
      )}
      {creatingGroup && <GroupCreateModal onClose={() => setCreatingGroup(false)} />}
      {renamingTag && <TagRenameModal tag={renamingTag} onClose={() => setRenamingTag(null)} />}
    </aside>
  );
}
