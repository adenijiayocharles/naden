import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Server } from "../types/server";

type ActiveView = "list" | "add" | "edit";
export type ViewMode = "card" | "row";

interface UiStore {
  activeView: ActiveView;
  viewMode: ViewMode;
  serverListCollapsed: boolean;
  editingServerId: string | null;
  filterGroupId: string | null;
  filterTagId: string | null;
  searchQuery: string;
  searchResults: Server[] | null;

  openAdd: () => void;
  openEdit: (serverId: string) => void;
  closeForm: () => void;
  setFilterGroup: (groupId: string | null) => void;
  setFilterTag: (tagId: string | null) => void;
  setSearch: (query: string) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleServerList: () => void;
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;

export const useUiStore = create<UiStore>((set) => ({
  activeView: "list",
  viewMode: "card",
  serverListCollapsed: false,
  editingServerId: null,
  filterGroupId: null,
  filterTagId: null,
  searchQuery: "",
  searchResults: null,

  openAdd: () => set({ activeView: "add", editingServerId: null }),
  openEdit: (serverId) => set({ activeView: "edit", editingServerId: serverId }),
  closeForm: () => set({ activeView: "list", editingServerId: null }),
  setFilterGroup: (groupId) => set({ filterGroupId: groupId, filterTagId: null }),
  setFilterTag: (tagId) => set({ filterTagId: tagId, filterGroupId: null }),

  setViewMode: (mode) => set({ viewMode: mode }),
  toggleServerList: () => set((s) => ({ serverListCollapsed: !s.serverListCollapsed })),

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
        .catch(() => { /* silently ignore search errors */ });
    }, 50);
  },
}));
