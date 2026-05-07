import { useServerStore } from "../../store/serverStore";
import { useUiStore } from "../../store/uiStore";
import ServerCard from "./ServerCard";
import ServerRow from "./ServerRow";

export default function ServerList() {
  const servers = useServerStore((s) => s.servers);
  const groups = useServerStore((s) => s.groups);
  const isLoading = useServerStore((s) => s.isLoading);
  const openAdd = useUiStore((s) => s.openAdd);
  const viewMode = useUiStore((s) => s.viewMode);
  const { filterGroupId, filterTagId, searchQuery, searchResults } = useUiStore();

  const Item = viewMode === "row" ? ServerRow : ServerCard;
  const listClass = viewMode === "row"
    ? "border border-[#1a1a1a] rounded-lg"
    : "grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]";

  if (isLoading) {
    return (
      <div className={listClass}>
        {Array.from({ length: 6 }).map((_, i) => (
          viewMode === "row" ? (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 border-b border-[#1a1a1a] last:border-b-0 animate-pulse">
              <div className="w-1.5 h-1.5 rounded-full bg-[#222] shrink-0" />
              <div className="w-32 h-3 bg-[#1a1a1a] rounded" />
              <div className="flex-1 h-3 bg-[#161616] rounded" />
            </div>
          ) : (
            <div key={i} className="bg-[#111] border border-[#1e1e1e] rounded-lg p-4 flex flex-col gap-3 animate-pulse">
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 rounded-full bg-[#222] mt-1 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-[#1a1a1a] rounded w-3/4" />
                  <div className="h-3 bg-[#161616] rounded w-1/2" />
                </div>
              </div>
              <div className="h-px bg-[#1a1a1a] mt-auto" />
              <div className="h-7 bg-[#1a1a1a] rounded" />
            </div>
          )
        ))}
      </div>
    );
  }

  // Search results take priority over sidebar filters
  if (searchQuery.trim()) {
    const results = searchResults ?? [];
    return results.length === 0 ? (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-[#777] text-lg font-medium mb-1">No matches</p>
        <p className="text-[#333] text-sm">No servers match "{searchQuery}"</p>
      </div>
    ) : (
      <div className={listClass}>
        {results.map((s) => <Item key={s.id} server={s} />)}
      </div>
    );
  }

  const filtered = (() => {
    if (filterGroupId) return servers.filter((s) => s.groupId === filterGroupId);
    if (filterTagId) return servers.filter((s) => s.tags.some((t) => t.id === filterTagId));
    return servers;
  })();

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-[#777] text-lg font-medium mb-1">No servers yet</p>
        <p className="text-[#333] text-sm mb-4">
          {filterGroupId || filterTagId
            ? "No servers match the current filter."
            : "Add your first server or import from ~/.ssh/config"}
        </p>
        {!filterGroupId && !filterTagId && (
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

  if (filterGroupId || filterTagId) {
    return (
      <div className={listClass}>
        {filtered.map((s) => <Item key={s.id} server={s} />)}
      </div>
    );
  }

  const ungrouped = filtered.filter((s) => !s.groupId);
  const sections = groups
    .map((g) => ({ group: g, items: filtered.filter((s) => s.groupId === g.id) }))
    .filter(({ items }) => items.length > 0);

  return (
    <div className="space-y-6">
      {sections.map(({ group, items }) => (
        <section key={group.id}>
          <h2
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-2"
            style={{ color: group.color ?? "#666" }}
          >
            {group.color && (
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
            )}
            {group.name}
            <span className="text-[#333] normal-case font-normal tracking-normal">{items.length}</span>
          </h2>
          <div className={listClass}>
            {items.map((s) => <Item key={s.id} server={s} />)}
          </div>
        </section>
      ))}

      {ungrouped.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-[#666] uppercase tracking-wider mb-2">
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
