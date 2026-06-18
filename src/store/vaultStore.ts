import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { vaultCommands } from "../lib/tauriCommands";

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
        vaultCommands.isSetup(),
        vaultCommands.isUnlocked(),
        vaultCommands.isPasswordRequired(),
      ]);
      set({ isSetup, isUnlocked, isPasswordRequired });
    } finally {
      set({ isChecking: false });
    }
  },

  setup: async (password) => {
    await vaultCommands.setup(password);
    set({ isSetup: true, isUnlocked: true });
  },

  skipSetup: async () => {
    await vaultCommands.skipSetup();
    set({ isSetup: true, isUnlocked: true, isPasswordRequired: false });
  },

  unlock: async (password) => {
    const ok = await vaultCommands.unlock(password);
    if (ok) set({ isUnlocked: true });
    return ok;
  },

  lock: async () => {
    await vaultCommands.lock();
    set({ isUnlocked: false });
  },

  disablePassword: async (currentPassword) => {
    await vaultCommands.disablePassword(currentPassword);
    set({ isPasswordRequired: false, isSetup: true, isUnlocked: true });
  },

  enablePassword: async (newPassword) => {
    await vaultCommands.enablePassword(newPassword);
    set({ isPasswordRequired: true, isSetup: true, isUnlocked: true });
  },

  changePassword: async (currentPassword, newPassword) => {
    await vaultCommands.changePassword(currentPassword, newPassword);
  },
}));

// Lock the vault whenever the Rust auto-lock task fires
listen("vault_auto_locked", () => {
  useVaultStore.setState({ isUnlocked: false });
}).catch((e) => console.error("[vault] failed to register auto-lock listener:", e));
