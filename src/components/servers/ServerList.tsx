import { useServerStore } from "../../store/serverStore";
import { useUiStore } from "../../store/uiStore";
import ServerCard from "./ServerCard";

export default function ServerList() {
  const servers = useServerStore((s) => s.servers);
  const groups = useServerStore((s) => s.groups);
  const isLoading = useServerStore((s) => s.isLoading);
  const openAdd = useUiStore((s) => s.openAdd);
  const { filterGroupId, filterTagId, searchQuery, searchResults } = useUiStore();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-[#666] text-sm">
        Loading…
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
      <div className="space-y-2">
        {results.map((s) => <ServerCard key={s.id} server={s} />)}
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
      <div className="space-y-2">
        {filtered.map((s) => <ServerCard key={s.id} server={s} />)}
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
          <div className="space-y-2">
            {items.map((s) => <ServerCard key={s.id} server={s} />)}
          </div>
        </section>
      ))}

      {ungrouped.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-[#666] uppercase tracking-wider mb-2">
            Ungrouped
          </h2>
          <div className="space-y-2">
            {ungrouped.map((s) => <ServerCard key={s.id} server={s} />)}
          </div>
        </section>
      )}
    </div>
  );
}
