import { useServerStore } from "../../store/serverStore";
import { useUiStore } from "../../store/uiStore";
import VaultCountdown from "./VaultCountdown";

const ClockIcon = () => (
  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

export default function Sidebar() {
  const servers = useServerStore((s) => s.servers);
  const groups = useServerStore((s) => s.groups);
  const tags = useServerStore((s) => s.tags);
  const { filterGroupId, filterTagId, filterFavourites, setFilterGroup, setFilterTag, setFilterFavourites, activeView, openAudit, closeForm } = useUiStore();

  // When in audit view, selecting any server nav item should return to list view first
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
          !filterGroupId && !filterTagId && !filterFavourites && activeView !== "audit",
          selectFilter(() => { setFilterGroup(null); setFilterTag(null); setFilterFavourites(false); }),
          "All Servers",
          servers.length,
        )}

        {navItem(
          filterFavourites && activeView !== "audit",
          selectFilter(() => setFilterFavourites(!filterFavourites)),
          <span className="flex items-center gap-2">
            <svg className={`w-3.5 h-3.5 shrink-0 ${filterFavourites ? "fill-yellow-400 text-yellow-400" : "fill-none text-[#777]"}`} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
            Favourites
          </span>,
          favouriteCount,
        )}

        {groups.length > 0 && (
          <div className="pt-3">
            <p className="px-3 pb-1 text-xs font-semibold text-[#666] uppercase tracking-wider">
              Groups
            </p>
            {groups.map((g) =>
              navItem(
                filterGroupId === g.id && activeView !== "audit",
                selectFilter(() => setFilterGroup(g.id)),
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
      <div className="p-2 border-t border-[#1e1e1e] shrink-0">
        <button
          onClick={() => { if (activeView === "audit") { closeForm(); } else { openAudit(); } }}
          className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${
            activeView === "audit"
              ? "bg-accent text-black font-medium"
              : "text-[#777] hover:bg-[#1a1a1a] hover:text-white"
          }`}
        >
          <ClockIcon />
          Audit Log
        </button>
      </div>
    </aside>
  );
}
