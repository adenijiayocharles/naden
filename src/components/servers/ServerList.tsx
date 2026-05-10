import { useMemo } from "react";
import { useServerStore } from "../../store/serverStore";
import { useUiStore, type SortMode } from "../../store/uiStore";
import ServerCard from "./ServerCard";
import ServerRow from "./ServerRow";
import type { Server } from "../../types/server";

function sortServers(list: Server[], mode: SortMode, lastConnectedMap: Record<string, string>): Server[] {
  if (mode === "default") return list;
  return [...list].sort((a, b) => {
    switch (mode) {
      case "name_asc": return a.displayName.localeCompare(b.displayName);
      case "name_desc": return b.displayName.localeCompare(a.displayName);
      case "host": return a.hostname.localeCompare(b.hostname);
      case "last_connected": {
        const la = lastConnectedMap[a.id] ?? "";
        const lb = lastConnectedMap[b.id] ?? "";
        return lb.localeCompare(la);
      }
      default: return 0;
    }
  });
}

export default function ServerList() {
  const servers = useServerStore((s) => s.servers);
  const groups = useServerStore((s) => s.groups);
  const lastConnectedMap = useServerStore((s) => s.lastConnectedMap);
  const isLoading = useServerStore((s) => s.isLoading);
  const openAdd = useUiStore((s) => s.openAdd);
  const viewMode = useUiStore((s) => s.viewMode);
  const sortMode = useUiStore((s) => s.sortMode);
  const collapsedGroups = useUiStore((s) => s.collapsedGroups);
  const toggleGroupCollapse = useUiStore((s) => s.toggleGroupCollapse);
  const { filterGroupId, filterTagId, filterFavourites, searchQuery, searchResults } = useUiStore();

  const Item = viewMode === "row" ? ServerRow : ServerCard;
  const listClass = viewMode === "row"
    ? "border border-stroke-subtle rounded-lg"
    : "grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]";

  // All hooks must be called before any early return.
  const sortedSearch = useMemo(
    () => sortServers(searchResults ?? [], sortMode, lastConnectedMap),
    [searchResults, sortMode, lastConnectedMap],
  );

  const filtered = useMemo(() => {
    if (filterFavourites) return servers.filter((s) => s.isFavourite);
    if (filterGroupId) return servers.filter((s) => s.groupId === filterGroupId);
    if (filterTagId) return servers.filter((s) => s.tags.some((t) => t.id === filterTagId));
    return servers;
  }, [servers, filterFavourites, filterGroupId, filterTagId]);

  const sortedFiltered = useMemo(
    () => sortServers(filtered, sortMode, lastConnectedMap),
    [filtered, sortMode, lastConnectedMap],
  );

  if (isLoading) {
    return (
      <div className={listClass}>
        {Array.from({ length: 6 }).map((_, i) => (
          viewMode === "row" ? (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 border-b border-[#1a1a1a] last:border-b-0 animate-pulse">
              <div className="w-1.5 h-1.5 rounded-full bg-surface-4 shrink-0" />
              <div className="w-32 h-3 bg-surface-3 rounded" />
              <div className="flex-1 h-3 bg-surface-2 rounded" />
            </div>
          ) : (
            <div key={i} className="bg-surface-1 border border-stroke-subtle rounded-lg p-4 flex flex-col gap-3 animate-pulse">
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 rounded-full bg-surface-4 mt-1 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-surface-3 rounded w-3/4" />
                  <div className="h-3 bg-surface-2 rounded w-1/2" />
                </div>
              </div>
              <div className="h-px bg-surface-3 mt-auto" />
              <div className="h-7 bg-surface-3 rounded" />
            </div>
          )
        ))}
      </div>
    );
  }

  // Search takes priority over all filters/sorting
  if (searchQuery.trim()) {
    return sortedSearch.length === 0 ? (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-muted text-lg font-medium mb-1">No matches</p>
        <p className="text-dim text-sm">No servers match "{searchQuery}"</p>
      </div>
    ) : (
      <div className={listClass}>
        {sortedSearch.map((s) => <Item key={s.id} server={s} />)}
      </div>
    );
  }

  if (filtered.length === 0) {
    const heading = filterFavourites
      ? "No favourites yet"
      : filterGroupId
        ? "No servers in this group"
        : filterTagId
          ? "No servers with this tag"
          : "No servers yet";
    const sub = filterFavourites
      ? "Star a server to add it to your favourites."
      : filterGroupId
        ? "Move a server here via its ⋮ menu."
        : filterTagId
          ? "Tag a server to see it here."
          : "Add your first server or import from ~/.ssh/config";
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-muted text-lg font-medium mb-1">{heading}</p>
        <p className="text-dim text-sm mb-4">{sub}</p>
        {!filterFavourites && !filterGroupId && !filterTagId && (
          <button
            onClick={openAdd}
            className="bg-accent hover:bg-accent-hover text-black text-sm font-semibold px-4 py-2 rounded transition-colors"
          >
            + Add Server
          </button>
        )}
      </div>
    );
  }

  // Filtered view (favourites, group, or tag active) — no sections
  if (filterFavourites || filterGroupId || filterTagId) {
    return (
      <div className={listClass}>
        {sortedFiltered.map((s) => <Item key={s.id} server={s} />)}
      </div>
    );
  }

  // ── Default view ────────────────────────────────────────────────────────────
  const ungrouped = sortedFiltered.filter((s) => !s.groupId);
  const sections = groups
    .map((g) => ({ group: g, items: sortedFiltered.filter((s) => s.groupId === g.id) }))
    .filter(({ items }) => items.length > 0);

  return (
    <div className="space-y-6">

      {sections.map(({ group, items }) => {
        const collapsed = collapsedGroups.has(group.id);
        return (
          <section key={group.id}>
            <button
              onClick={() => toggleGroupCollapse(group.id)}
              className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-2 w-full text-left select-none"
              style={{ color: group.color ?? "#666" }}
            >
              <svg
                className={`w-2.5 h-2.5 shrink-0 transition-transform ${collapsed ? "" : "rotate-90"}`}
                fill="none" viewBox="0 0 6 10" stroke="currentColor" strokeWidth={2}
                strokeLinecap="round" strokeLinejoin="round"
              >
                <polyline points="1,1 5,5 1,9" />
              </svg>
              {group.color && (
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
              )}
              {group.name}
              <span className="text-dim normal-case font-normal tracking-normal">{items.length}</span>
            </button>
            {!collapsed && (
              <div className={listClass}>
                {items.map((s) => <Item key={s.id} server={s} />)}
              </div>
            )}
          </section>
        );
      })}

      {ungrouped.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-faint uppercase tracking-wider mb-2">
            Ungrouped
          </h2>
          <div className={listClass}>
            {ungrouped.map((s) => <Item key={s.id} server={s} />)}
          </div>
        </section>
      )}
    </div>
  );
}
