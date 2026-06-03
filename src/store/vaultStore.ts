import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { vaultCommands } from "../lib/tauriCommands";

interface VaultStore {
  isSetup: boolean;
  isUnlocked: boolean;
  isChecking: boolean;
  isPasswordRequired: boolean;
  isBiometricAvailable: boolean;
  isBiometricEnabled: boolean;

  check: () => Promise<void>;
  setup: (password: string) => Promise<void>;
  skipSetup: () => Promise<void>;
  unlock: (password: string) => Promise<boolean>;
  unlockBiometric: () => Promise<void>;
  lock: () => Promise<void>;
  disablePassword: (currentPassword: string) => Promise<void>;
  enablePassword: (newPassword: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  enableBiometric: () => Promise<void>;
  disableBiometric: () => Promise<void>;
}

export const useVaultStore = create<VaultStore>((set) => ({
  isSetup: false,
  isUnlocked: false,
  isChecking: true,
  isPasswordRequired: true,
  isBiometricAvailable: false,
  isBiometricEnabled: false,

  check: async () => {
    set({ isChecking: true });
    try {
      const [isSetup, isUnlocked, isPasswordRequired, isBiometricAvailable, isBiometricEnabled] =
        await Promise.all([
          invoke<boolean>("vault_is_setup"),
          invoke<boolean>("vault_is_unlocked"),
          invoke<boolean>("vault_is_password_required"),
          vaultCommands.biometricAvailable(),
          vaultCommands.biometricEnabled(),
        ]);
      set({ isSetup, isUnlocked, isPasswordRequired, isBiometricAvailable, isBiometricEnabled });
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

  unlockBiometric: async () => {
    await vaultCommands.unlockBiometric();
    set({ isUnlocked: true });
  },

  lock: async () => {
    await invoke("vault_lock");
    set({ isUnlocked: false });
  },

  disablePassword: async (currentPassword) => {
    await invoke("vault_disable_password", { currentPassword });
    set({ isPasswordRequired: false, isSetup: true, isUnlocked: true, isBiometricEnabled: false });
  },

  enablePassword: async (newPassword) => {
    await invoke("vault_enable_password", { newPassword });
    set({ isPasswordRequired: true, isSetup: true, isUnlocked: true });
  },

  changePassword: async (currentPassword, newPassword) => {
    await invoke("vault_change_password", { currentPassword, newPassword });
  },

  enableBiometric: async () => {
    await vaultCommands.enableBiometric();
    set({ isBiometricEnabled: true });
  },

  disableBiometric: async () => {
    await vaultCommands.disableBiometric();
    set({ isBiometricEnabled: false });
  },
}));

// Lock the vault whenever the Rust auto-lock task fires
void listen("vault_auto_locked", () => {
  useVaultStore.setState({ isUnlocked: false });
});
