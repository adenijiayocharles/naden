import { useMemo, useState } from "react";
import { useServerStore } from "../../store/serverStore";
import { useUiStore, type SortMode } from "../../store/uiStore";
import { useTerminalStore } from "../../store/terminalStore";
import { useSftpStore } from "../../store/sftpStore";
import ServerCard from "./ServerCard";
import ServerRow from "./ServerRow";
import EmptyState from "../shared/EmptyState";
import type { Server, Group } from "../../types/server";

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

function groupColorFor(groups: Group[], groupId: string | undefined): string | undefined {
  if (!groupId) return undefined;
  return groups.find((g) => g.id === groupId)?.color;
}

export default function ServerList() {
  const servers = useServerStore((s) => s.servers);
  const groups = useServerStore((s) => s.groups);
  const lastConnectedMap = useServerStore((s) => s.lastConnectedMap);
  const isLoading = useServerStore((s) => s.isLoading);
  const openAdd = useUiStore((s) => s.openAdd);
  const openImportSshConfig = useUiStore((s) => s.openImportSshConfig);
  const [showAddPicker, setShowAddPicker] = useState(false);
  const viewMode = useUiStore((s) => s.viewMode);
  const sortMode = useUiStore((s) => s.sortMode);
  const filterGroupId = useUiStore((s) => s.filterGroupId);
  const filterTagId = useUiStore((s) => s.filterTagId);
  const filterFavourites = useUiStore((s) => s.filterFavourites);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const searchResults = useUiStore((s) => s.searchResults);
  const hasTerminal = useTerminalStore((s) => s.sessions.length > 0);
  const hasSftp = useSftpStore((s) => s.sessions.length > 0);
  const hasPanel = hasTerminal || hasSftp;

  const listClass = viewMode === "row"
    ? "border border-stroke-subtle rounded-lg"
    : "grid gap-3 grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))]";

  const renderItem = (s: Server) =>
    viewMode === "row" ? (
      <ServerRow
        key={s.id}
        server={s}
        groupColor={groupColorFor(groups, s.groupId)}
        lastConnected={lastConnectedMap[s.id]}
        narrow={hasPanel}
      />
    ) : (
      <ServerCard
        key={s.id}
        server={s}
        groupColor={groupColorFor(groups, s.groupId)}
        lastConnected={lastConnectedMap[s.id]}
      />
    );

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
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 border-b border-stroke-subtle last:border-b-0 animate-pulse">
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
      <EmptyState
        icon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35M8.5 8.5l5 5M13.5 8.5l-5 5" />
          </svg>
        }
        heading="No matches"
        subline={`No servers match "${searchQuery}"`}
      />
    ) : (
      <div className={listClass}>
        {sortedSearch.map((s) => renderItem(s))}
      </div>
    );
  }

  if (filtered.length === 0) {
    if (filterFavourites) {
      return (
        <EmptyState
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          }
          heading="No favourites yet"
          subline="Star a server to add it to your favourites."
        />
      );
    }
    if (filterGroupId) {
      return (
        <EmptyState
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2z" />
            </svg>
          }
          heading="No servers in this group"
          subline="Move a server here via its ⋮ menu."
        />
      );
    }
    if (filterTagId) {
      return (
        <EmptyState
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <circle cx="7" cy="7" r="1" fill="currentColor" stroke="none" />
            </svg>
          }
          heading="No servers with this tag"
          subline="Tag a server to see it here."
        />
      );
    }
    return (
      <>
        <EmptyState
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="8" rx="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" />
              <circle cx="6" cy="6" r="1" fill="currentColor" stroke="none" />
              <circle cx="6" cy="18" r="1" fill="currentColor" stroke="none" />
            </svg>
          }
          heading="No servers yet"
          subline="Add your first server or import from ~/.ssh/config"
          action={{ label: "+ Add Server", onClick: () => setShowAddPicker(true) }}
        />

        {showAddPicker && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 animate-backdrop-in"
            onClick={() => setShowAddPicker(false)}
          >
            <div
              className="bg-surface-2 border border-stroke rounded-xl shadow-overlay animate-overlay-in w-full max-w-sm mx-4 p-6 flex flex-col gap-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <h2 className="text-white font-semibold text-base">Add a server</h2>
                  <p className="text-muted text-sm">How would you like to add it?</p>
                </div>
                <button
                  onClick={() => setShowAddPicker(false)}
                  className="text-muted hover:text-white p-1 rounded transition-colors shrink-0"
                  aria-label="Close"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
                    <line x1="3" y1="3" x2="13" y2="13" />
                    <line x1="13" y1="3" x2="3" y2="13" />
                  </svg>
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => { setShowAddPicker(false); openAdd(); }}
                  className="flex items-start gap-3 w-full text-left px-4 py-3 rounded-lg bg-surface-3 hover:bg-surface-4 border border-stroke hover:border-accent/40 transition-colors group"
                >
                  <svg className="w-5 h-5 mt-0.5 text-accent-fg shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-white">Add manually</p>
                    <p className="text-meta text-muted mt-0.5">Fill in the host, port, and auth details yourself.</p>
                  </div>
                </button>
                <button
                  onClick={() => { setShowAddPicker(false); openImportSshConfig(); }}
                  className="flex items-start gap-3 w-full text-left px-4 py-3 rounded-lg bg-surface-3 hover:bg-surface-4 border border-stroke hover:border-accent/40 transition-colors group"
                >
                  <svg className="w-5 h-5 mt-0.5 text-accent-fg shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="8" y1="13" x2="16" y2="13" />
                    <line x1="8" y1="17" x2="16" y2="17" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-white">Import from ~/.ssh/config</p>
                    <p className="text-meta text-muted mt-0.5">Pick hosts already defined in your SSH config file.</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Filtered view (favourites, group, or tag active) — no sections
  if (filterFavourites || filterGroupId || filterTagId) {
    return (
      <div className={listClass}>
        {sortedFiltered.map((s) => renderItem(s))}
      </div>
    );
  }

  // ── Default view (All Servers) — flat list, no group sections ──────────────
  return (
    <div className={listClass}>
      {sortedFiltered.map((s) => renderItem(s))}
    </div>
  );
}
