import { create } from "zustand";
import { playbookCommands } from "../lib/commands/content";
import { crudActions } from "./crudActions";
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

export const usePlaybookStore = create<PlaybookStore>((set) => {
  const actions = crudActions<PlaybookStore, Playbook, CreatePlaybookPayload, UpdatePlaybookPayload>(set, {
    commands: {
      list: playbookCommands.listPlaybooks,
      create: playbookCommands.createPlaybook,
      update: playbookCommands.updatePlaybook,
      remove: playbookCommands.deletePlaybook,
    },
    getItems: (s) => s.playbooks,
    setItems: (playbooks) => ({ playbooks }),
    setLoading: (isLoading) => ({ isLoading }),
    setError: (error) => ({ error }),
    sortKey: (p) => p.title,
  });

  return {
    playbooks: [],
    isLoading: false,
    error: null,

    fetchAll: actions.fetchAll,
    createPlaybook: actions.create,
    updatePlaybook: actions.update,
    deletePlaybook: actions.remove,
  };
});
