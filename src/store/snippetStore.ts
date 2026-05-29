import { create } from "zustand";
import { snippetCommands } from "../lib/tauriCommands";
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

export const useSnippetStore = create<SnippetStore>((set) => ({
  snippets: [],
  isLoading: false,
  error: null,

  fetchAll: async () => {
    set({ isLoading: true, error: null });
    try {
      const snippets = await snippetCommands.listSnippets();
      set({ snippets });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ isLoading: false });
    }
  },

  createSnippet: async (payload) => {
    const snippet = await snippetCommands.createSnippet(payload);
    set((s) => ({ snippets: [...s.snippets, snippet].sort((a, b) => a.title.localeCompare(b.title)) }));
    return snippet;
  },

  updateSnippet: async (id, payload) => {
    const updated = await snippetCommands.updateSnippet(id, payload);
    set((s) => ({
      snippets: s.snippets
        .map((sn) => (sn.id === id ? updated : sn))
        .sort((a, b) => a.title.localeCompare(b.title)),
    }));
    return updated;
  },

  deleteSnippet: async (id) => {
    await snippetCommands.deleteSnippet(id);
    set((s) => ({ snippets: s.snippets.filter((sn) => sn.id !== id) }));
  },
}));
