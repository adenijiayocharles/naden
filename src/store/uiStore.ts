import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Server } from "../types/server";

type ActiveView = "list" | "add" | "edit" | "audit";
export type ViewMode = "card" | "row";
interface UiStore {
  activeView: ActiveView;
  viewMode: ViewMode;
  serverListCollapsed: boolean;
  settingsOpen: boolean;
  onboardingComplete: boolean;
  onboardingChecked: boolean;
  editingServerId: string | null;
  filterGroupId: string | null;
  filterTagId: string | null;
  filterFavourites: boolean;
  searchQuery: string;
  searchResults: Server[] | null;
  bulkMode: boolean;
  bulkSelected: string[];

  openAdd: () => void;
  openEdit: (serverId: string) => void;
  openAudit: () => void;
  closeForm: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  setOnboardingComplete: (v: boolean) => void;
  setOnboardingChecked: () => void;
  setFilterGroup: (groupId: string | null) => void;
  setFilterTag: (tagId: string | null) => void;
  setFilterFavourites: (v: boolean) => void;
  setSearch: (query: string) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleServerList: () => void;
  toggleBulkMode: () => void;
  toggleSelected: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelected: () => void;
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;

export const useUiStore = create<UiStore>((set) => ({
  activeView: "list",
  viewMode: "card",
  serverListCollapsed: false,
  settingsOpen: false,
  onboardingComplete: true, // assume complete until checked
  onboardingChecked: false,
  editingServerId: null,
  filterGroupId: null,
  filterTagId: null,
  filterFavourites: false,
  searchQuery: "",
  searchResults: null,
  bulkMode: false,
  bulkSelected: [],

  openAdd: () => set({ activeView: "add", editingServerId: null }),
  openEdit: (serverId) => set({ activeView: "edit", editingServerId: serverId }),
  openAudit: () => set({ activeView: "audit", editingServerId: null }),
  closeForm: () => set({ activeView: "list", editingServerId: null }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  setOnboardingComplete: (v) => set({ onboardingComplete: v }),
  setOnboardingChecked: () => set({ onboardingChecked: true }),
  setFilterGroup: (groupId) => set({ filterGroupId: groupId, filterTagId: null, filterFavourites: false }),
  setFilterTag: (tagId) => set({ filterTagId: tagId, filterGroupId: null, filterFavourites: false }),
  setFilterFavourites: (v) => set({ filterFavourites: v, filterGroupId: null, filterTagId: null }),

  setViewMode: (mode) => set({ viewMode: mode }),
  toggleServerList: () => set((s) => ({ serverListCollapsed: !s.serverListCollapsed })),
  toggleBulkMode: () => set((s) => ({ bulkMode: !s.bulkMode, bulkSelected: [] })),
  toggleSelected: (id) => set((s) => ({
    bulkSelected: s.bulkSelected.includes(id)
      ? s.bulkSelected.filter((x) => x !== id)
      : [...s.bulkSelected, id],
  })),
  selectAll: (ids) => set({ bulkSelected: ids }),
  clearSelected: () => set({ bulkSelected: [] }),

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
