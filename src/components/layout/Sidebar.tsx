import { useServerStore } from "../../store/serverStore";
import { useUiStore } from "../../store/uiStore";

export default function Sidebar() {
  const servers = useServerStore((s) => s.servers);
  const groups = useServerStore((s) => s.groups);
  const tags = useServerStore((s) => s.tags);
  const { filterGroupId, filterTagId, setFilterGroup, setFilterTag } = useUiStore();

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
          : "text-[#bbb] hover:bg-[#1a1a1a] hover:text-white"
      }`}
    >
      <span className="truncate">{label}</span>
      {count !== undefined && (
        <span className={`text-xs ml-2 shrink-0 ${active ? "text-black/60" : "text-[#777]"}`}>
          {count}
        </span>
      )}
    </button>
  );

  return (
    <aside className="w-60 shrink-0 bg-[#0d0d0d] border-r border-[#1e1e1e] flex flex-col overflow-y-auto">
      <div className="h-14 flex items-center px-4 border-b border-[#1e1e1e] shrink-0">
        <span className="font-bold text-white text-base tracking-tight">
          SSH <span className="text-accent">Manager</span>
        </span>
      </div>

      <nav className="flex-1 p-2 space-y-0.5">
        {navItem(
          !filterGroupId && !filterTagId,
          () => { setFilterGroup(null); setFilterTag(null); },
          "All Servers",
          servers.length,
        )}

        {groups.length > 0 && (
          <div className="pt-3">
            <p className="px-3 pb-1 text-xs font-semibold text-[#666] uppercase tracking-wider">
              Groups
            </p>
            {groups.map((g) =>
              navItem(
                filterGroupId === g.id,
                () => setFilterGroup(g.id),
                <span className="flex items-center gap-2">
                  {g.color && (
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: g.color }}
                    />
                  )}
                  {g.name}
                </span>,
                countByGroup[g.id] ?? 0,
              ),
            )}
          </div>
        )}

        {tags.length > 0 && (
          <div className="pt-3">
            <p className="px-3 pb-1 text-xs font-semibold text-[#666] uppercase tracking-wider">
              Tags
            </p>
            {tags.map((t) =>
              navItem(
                filterTagId === t.id,
                () => setFilterTag(t.id),
                `#${t.name}`,
                countByTag[t.id] ?? 0,
              ),
            )}
          </div>
        )}
      </nav>
    </aside>
  );
}
