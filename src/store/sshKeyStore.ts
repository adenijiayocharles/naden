import { create } from "zustand";
import { keyCommands } from "../lib/tauriCommands";
import type { SshKey, GenerateKeyPayload } from "../types/sshKey";

interface SshKeyStore {
  keys: SshKey[];
  isLoading: boolean;
  loaded: boolean;
  error: string | null;

  load: () => Promise<void>;
  addKey: (path: string, name?: string) => Promise<SshKey>;
  generateKey: (payload: GenerateKeyPayload) => Promise<SshKey>;
  removeKey: (id: string) => Promise<void>;
  renameKey: (id: string, name: string) => Promise<void>;
  getPublicKey: (id: string) => Promise<string>;
}

export const useSshKeyStore = create<SshKeyStore>((set, get) => ({
  keys: [],
  isLoading: false,
  loaded: false,
  error: null,

  load: async () => {
    const { loaded, isLoading } = get();
    if (loaded || isLoading) return;
    set({ isLoading: true, error: null });
    try {
      const keys = await keyCommands.listSshKeys();
      set({ keys, isLoading: false, loaded: true });
    } catch (e) {
      set({ isLoading: false, error: String(e) });
    }
  },

  addKey: async (path, name) => {
    const key = await keyCommands.addSshKey(path, name);
    set((s) => ({ keys: [...s.keys, key] }));
    return key;
  },

  generateKey: async (payload) => {
    const key = await keyCommands.generateSshKey(
      payload.name,
      payload.keyType,
      payload.outputPath,
      payload.passphrase,
    );
    set((s) => ({ keys: [...s.keys, key] }));
    return key;
  },

  removeKey: async (id) => {
    await keyCommands.removeSshKey(id);
    set((s) => ({ keys: s.keys.filter((k) => k.id !== id) }));
  },

  renameKey: async (id, name) => {
    const updated = await keyCommands.renameSshKey(id, name);
    set((s) => ({ keys: s.keys.map((k) => (k.id === id ? updated : k)) }));
  },

  getPublicKey: async (id) => {
    return keyCommands.getPublicKey(id);
  },
}));
