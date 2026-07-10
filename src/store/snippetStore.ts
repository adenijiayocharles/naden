import { create } from "zustand";
import { snippetCommands } from "../lib/commands/content";
import { crudActions } from "./crudActions";
import type { Snippet, CreateSnippetPayload, UpdateSnippetPayload } from "../types/snippet";

interface SnippetStore {
  snippets: Snippet[];
  isLoading: boolean;
  error: string | null;

  fetchAll: () => Promise<void>;
  createSnippet: (payload: CreateSnippetPayload) => Promise<Snippet>;
  updateSnippet: (id: string, payload: UpdateSnippetPayload) => Promise<Snippet>;
  deleteSnippet: (id: string) => Promise<void>;
}

export const useSnippetStore = create<SnippetStore>((set) => {
  const actions = crudActions<SnippetStore, Snippet, CreateSnippetPayload, UpdateSnippetPayload>(set, {
    commands: {
      list: snippetCommands.listSnippets,
      create: snippetCommands.createSnippet,
      update: snippetCommands.updateSnippet,
      remove: snippetCommands.deleteSnippet,
    },
    getItems: (s) => s.snippets,
    setItems: (snippets) => ({ snippets }),
    setLoading: (isLoading) => ({ isLoading }),
    setError: (error) => ({ error }),
    sortKey: (s) => s.title,
  });

  return {
    snippets: [],
    isLoading: false,
    error: null,

    fetchAll: actions.fetchAll,
    createSnippet: actions.create,
    updateSnippet: actions.update,
    deleteSnippet: actions.remove,
  };
});
