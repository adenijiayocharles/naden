import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

interface VaultStore {
  isSetup: boolean;
  isUnlocked: boolean;
  isChecking: boolean;
  setupDismissed: boolean;

  check: () => Promise<void>;
  setup: (password: string) => Promise<void>;
  unlock: (password: string) => Promise<boolean>;
  lock: () => Promise<void>;
  dismissSetup: () => void;
}

export const useVaultStore = create<VaultStore>((set) => ({
  isSetup: false,
  isUnlocked: false,
  isChecking: true,
  setupDismissed: false,

  check: async () => {
    set({ isChecking: true });
    const [isSetup, isUnlocked] = await Promise.all([
      invoke<boolean>("vault_is_setup"),
      invoke<boolean>("vault_is_unlocked"),
    ]);
    set({ isSetup, isUnlocked, isChecking: false });
  },

  setup: async (password) => {
    await invoke("vault_setup", { masterPassword: password });
    set({ isSetup: true, isUnlocked: true });
  },

  unlock: async (password) => {
    const ok = await invoke<boolean>("vault_unlock", { masterPassword: password });
    if (ok) set({ isUnlocked: true });
    return ok;
  },

  lock: async () => {
    await invoke("vault_lock");
    set({ isUnlocked: false });
  },

  dismissSetup: () => set({ setupDismissed: true }),
}));
