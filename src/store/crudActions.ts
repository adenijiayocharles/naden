/**
 * Shared implementation for simple "list of records with fetchAll/create/
 * update/delete" Zustand stores (snippets, playbooks, ...). Callers supply
 * plain getter/setter functions so each store keeps its own domain-specific
 * field and action names — this only removes the duplicated async bodies.
 */
export interface CrudCommands<T, CreatePayload, UpdatePayload> {
  list: () => Promise<T[]>;
  create: (payload: CreatePayload) => Promise<T>;
  update: (id: string, payload: UpdatePayload) => Promise<T>;
  remove: (id: string) => Promise<void>;
}

export interface CrudActionsOptions<S, T, CreatePayload, UpdatePayload> {
  commands: CrudCommands<T, CreatePayload, UpdatePayload>;
  getItems: (state: S) => T[];
  setItems: (items: T[]) => Partial<S>;
  setLoading: (loading: boolean) => Partial<S>;
  setError: (error: string | null) => Partial<S>;
  /** Sort key applied after every create/update so the list stays ordered. */
  sortKey: (item: T) => string;
}

export function crudActions<S, T extends { id: string }, CreatePayload, UpdatePayload>(
  set: (partial: Partial<S> | ((state: S) => Partial<S>)) => void,
  opts: CrudActionsOptions<S, T, CreatePayload, UpdatePayload>,
) {
  const { commands, getItems, setItems, setLoading, setError, sortKey } = opts;
  const sorted = (items: T[]) => [...items].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  return {
    fetchAll: async () => {
      set({ ...setLoading(true), ...setError(null) });
      try {
        set(setItems(await commands.list()));
      } catch (e) {
        set(setError(String(e)));
      } finally {
        set(setLoading(false));
      }
    },

    create: async (payload: CreatePayload) => {
      const item = await commands.create(payload);
      set((s) => setItems(sorted([...getItems(s), item])));
      return item;
    },

    update: async (id: string, payload: UpdatePayload) => {
      const updated = await commands.update(id, payload);
      set((s) => setItems(sorted(getItems(s).map((it) => (it.id === id ? updated : it)))));
      return updated;
    },

    remove: async (id: string) => {
      await commands.remove(id);
      set((s) => setItems(getItems(s).filter((it) => it.id !== id)));
    },
  };
}
