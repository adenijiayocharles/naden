import { create } from "zustand";

type ActiveView = "list" | "add" | "edit";

interface UiStore {
  activeView: ActiveView;
  editingServerId: string | null;
  filterGroupId: string | null;
  filterTagId: string | null;

  openAdd: () => void;
  openEdit: (serverId: string) => void;
  closeForm: () => void;
  setFilterGroup: (groupId: string | null) => void;
  setFilterTag: (tagId: string | null) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  activeView: "list",
  editingServerId: null,
  filterGroupId: null,
  filterTagId: null,

  openAdd: () => set({ activeView: "add", editingServerId: null }),
  openEdit: (serverId) => set({ activeView: "edit", editingServerId: serverId }),
  closeForm: () => set({ activeView: "list", editingServerId: null }),
  setFilterGroup: (groupId) => set({ filterGroupId: groupId, filterTagId: null }),
  setFilterTag: (tagId) => set({ filterTagId: tagId, filterGroupId: null }),
}));
