import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Server } from "../types/server";

type ActiveView = "list" | "add" | "edit" | "logs" | "snippets" | "playbooks" | "tunnels" | "settings" | "keys";
export type ViewMode = "card" | "row";
export type SortMode = "default" | "name_asc" | "name_desc" | "host" | "last_connected";
interface UiStore {
  activeView: ActiveView;
  viewMode: ViewMode;
  sortMode: SortMode;
  collapsedGroups: Set<string>;
  sidebarCollapsed: boolean;
  serverListCollapsed: boolean;
  importSshConfigOpen: boolean;
  onboardingComplete: boolean;
  onboardingChecked: boolean;
  editingServerId: string | null;
  filterGroupId: string | null;
  filterTagId: string | null;
  filterFavourites: boolean;
  searchQuery: string;
  searchResults: Server[] | null;
  logSearchQuery: string;
  bulkMode: boolean;
  bulkSelected: string[];
  vaultTimeoutMins: number;

  openAdd: () => void;
  openEdit: (serverId: string) => void;
  openLogs: () => void;
  openSnippets: () => void;
  openPlaybooks: () => void;
  openTunnels: () => void;
  openKeys: () => void;
  closeForm: () => void;
  openSettings: () => void;
  openImportSshConfig: () => void;
  closeImportSshConfig: () => void;
  setOnboardingComplete: (v: boolean) => void;
  setOnboardingChecked: () => void;
  setFilterGroup: (groupId: string | null) => void;
  setFilterTag: (tagId: string | null) => void;
  setFilterFavourites: (v: boolean) => void;
  setSearch: (query: string) => void;
  setLogSearch: (query: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setSortMode: (mode: SortMode) => void;
  toggleGroupCollapse: (groupId: string) => void;
  toggleSidebar: () => void;
  toggleServerList: () => void;
  collapseServerList: () => void;
  expandServerList: () => void;
  toggleBulkMode: () => void;
  toggleSelected: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelected: () => void;
  setVaultTimeoutMins: (mins: number) => void;
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;

export const useUiStore = create<UiStore>((set) => ({
  activeView: "list",
  viewMode: "card",
  sortMode: "default",
  collapsedGroups: new Set<string>(),
  sidebarCollapsed: false,
  serverListCollapsed: false,
  importSshConfigOpen: false,
  onboardingComplete: true, // assume complete until checked
  onboardingChecked: false,
  editingServerId: null,
  filterGroupId: null,
  filterTagId: null,
  filterFavourites: false,
  searchQuery: "",
  searchResults: null,
  logSearchQuery: "",
  bulkMode: false,
  bulkSelected: [],
  vaultTimeoutMins: 0,

  openAdd: () => set({ activeView: "add", editingServerId: null }),
  openEdit: (serverId) => set({ activeView: "edit", editingServerId: serverId }),
  openLogs: () => set({ activeView: "logs", editingServerId: null }),
  openSnippets: () => set({ activeView: "snippets", editingServerId: null }),
  openPlaybooks: () => set({ activeView: "playbooks", editingServerId: null }),
  openTunnels: () => set({ activeView: "tunnels", editingServerId: null }),
  openKeys: () => set({ activeView: "keys", editingServerId: null }),
  closeForm: () => set({ activeView: "list", editingServerId: null }),
  openSettings: () => set({ activeView: "settings", editingServerId: null }),
  openImportSshConfig: () => set({ importSshConfigOpen: true }),
  closeImportSshConfig: () => set({ importSshConfigOpen: false }),
  setOnboardingComplete: (v) => set({ onboardingComplete: v }),
  setOnboardingChecked: () => set({ onboardingChecked: true }),
  setFilterGroup: (groupId) => set({ filterGroupId: groupId, filterTagId: null, filterFavourites: false }),
  setFilterTag: (tagId) => set({ filterTagId: tagId, filterGroupId: null, filterFavourites: false }),
  setFilterFavourites: (v) => set({ filterFavourites: v, filterGroupId: null, filterTagId: null }),

  setLogSearch: (query) => set({ logSearchQuery: query }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSortMode: (mode) => set({ sortMode: mode }),
  toggleGroupCollapse: (groupId) => set((s) => {
    const next = new Set(s.collapsedGroups);
    if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
    return { collapsedGroups: next };
  }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleServerList: () => set((s) => ({ serverListCollapsed: !s.serverListCollapsed })),
  collapseServerList: () => set({ serverListCollapsed: true }),
  expandServerList: () => set({ serverListCollapsed: false }),
  toggleBulkMode: () => set((s) => ({ bulkMode: !s.bulkMode, bulkSelected: [] })),
  toggleSelected: (id) => set((s) => ({
    bulkSelected: s.bulkSelected.includes(id)
      ? s.bulkSelected.filter((x) => x !== id)
      : [...s.bulkSelected, id],
  })),
  selectAll: (ids) => set({ bulkSelected: ids }),
  clearSelected: () => set({ bulkSelected: [] }),
  setVaultTimeoutMins: (mins) => set({ vaultTimeoutMins: mins }),

  setSearch: (query) => {
    set({ searchQuery: query });
    if (searchTimer) clearTimeout(searchTimer);

    if (!query.trim()) {
      set({ searchResults: null });
      return;
    }

    searchTimer = setTimeout(() => {
      invoke<Server[]>("fuzzy_search", { query })
        .then((results) => set({ searchResults: results }))
        .catch((e) => { console.error("[search] fuzzy_search failed:", e); });
    }, 50);
  },
}));
