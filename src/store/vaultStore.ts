import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface VaultStore {
  isSetup: boolean;
  isUnlocked: boolean;
  isChecking: boolean;
  isPasswordRequired: boolean;

  check: () => Promise<void>;
  setup: (password: string) => Promise<void>;
  skipSetup: () => Promise<void>;
  unlock: (password: string) => Promise<boolean>;
  lock: () => Promise<void>;
  disablePassword: (currentPassword: string) => Promise<void>;
  enablePassword: (newPassword: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

export const useVaultStore = create<VaultStore>((set) => ({
  isSetup: false,
  isUnlocked: false,
  isChecking: true,
  isPasswordRequired: true,

  check: async () => {
    set({ isChecking: true });
    try {
      const [isSetup, isUnlocked, isPasswordRequired] = await Promise.all([
        invoke<boolean>("vault_is_setup"),
        invoke<boolean>("vault_is_unlocked"),
        invoke<boolean>("vault_is_password_required"),
      ]);
      set({ isSetup, isUnlocked, isPasswordRequired });
    } finally {
      set({ isChecking: false });
    }
  },

  setup: async (password) => {
    await invoke("vault_setup", { masterPassword: password });
    set({ isSetup: true, isUnlocked: true });
  },

  skipSetup: async () => {
    await invoke("vault_skip_setup");
    set({ isSetup: true, isUnlocked: true, isPasswordRequired: false });
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

  disablePassword: async (currentPassword) => {
    await invoke("vault_disable_password", { currentPassword });
    set({ isPasswordRequired: false, isSetup: true, isUnlocked: true });
  },

  enablePassword: async (newPassword) => {
    await invoke("vault_enable_password", { newPassword });
    set({ isPasswordRequired: true, isSetup: true, isUnlocked: true });
  },

  changePassword: async (currentPassword, newPassword) => {
    await invoke("vault_change_password", { currentPassword, newPassword });
  },
}));

// Lock the vault whenever the Rust auto-lock task fires
void listen("vault_auto_locked", () => {
  useVaultStore.setState({ isUnlocked: false });
});
