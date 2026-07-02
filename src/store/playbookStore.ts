import { create } from "zustand";
import { playbookCommands } from "../lib/commands/content";
import type { Playbook, CreatePlaybookPayload, UpdatePlaybookPayload } from "../types/playbook";

interface PlaybookStore {
  playbooks: Playbook[];
  isLoading: boolean;
  error: string | null;

  fetchAll: () => Promise<void>;
  createPlaybook: (payload: CreatePlaybookPayload) => Promise<Playbook>;
  updatePlaybook: (id: string, payload: UpdatePlaybookPayload) => Promise<Playbook>;
  deletePlaybook: (id: string) => Promise<void>;
}

export const usePlaybookStore = create<PlaybookStore>((set) => ({
  playbooks: [],
  isLoading: false,
  error: null,

  fetchAll: async () => {
    set({ isLoading: true, error: null });
    try {
      const playbooks = await playbookCommands.listPlaybooks();
      set({ playbooks });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ isLoading: false });
    }
  },

  createPlaybook: async (payload) => {
    const playbook = await playbookCommands.createPlaybook(payload);
    set((s) => ({ playbooks: [...s.playbooks, playbook].sort((a, b) => a.title.localeCompare(b.title)) }));
    return playbook;
  },

  updatePlaybook: async (id, payload) => {
    const updated = await playbookCommands.updatePlaybook(id, payload);
    set((s) => ({
      playbooks: s.playbooks
        .map((pb) => (pb.id === id ? updated : pb))
        .sort((a, b) => a.title.localeCompare(b.title)),
    }));
    return updated;
  },

  deletePlaybook: async (id) => {
    await playbookCommands.deletePlaybook(id);
    set((s) => ({ playbooks: s.playbooks.filter((pb) => pb.id !== id) }));
  },
}));
