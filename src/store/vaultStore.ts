import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { vaultCommands } from "../lib/commands/vault";

interface VaultStore {
  isSetup: boolean;
  isUnlocked: boolean;
  isChecking: boolean;
  isPasswordRequired: boolean;
  needsFormatUpgrade: boolean;

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
  needsFormatUpgrade: false,

  check: async () => {
    set({ isChecking: true });
    try {
      const [isSetup, isUnlocked, isPasswordRequired, needsFormatUpgrade] = await Promise.all([
        vaultCommands.isSetup(),
        vaultCommands.isUnlocked(),
        vaultCommands.isPasswordRequired(),
        vaultCommands.needsFormatUpgrade(),
      ]);
      set({ isSetup, isUnlocked, isPasswordRequired, needsFormatUpgrade });
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
    if (ok) set({ isUnlocked: true, needsFormatUpgrade: false });
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

/** True while VaultGate is covering the app with VaultLockScreen. Shared so every
 *  consumer that needs to suppress background activity during a lock (e.g. gating
 *  which SFTP/terminal tab is allowed to react to input) agrees with VaultGate on
 *  what "locked" means. */
export function useVaultLocked(): boolean {
  return useVaultStore((s) => s.isSetup && !s.isUnlocked && s.isPasswordRequired);
}
