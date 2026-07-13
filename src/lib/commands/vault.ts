import { invoke } from "@tauri-apps/api/core";

export const vaultCommands = {
  storeCredential: (secret: string) =>
    invoke<string>("store_credential", { secret }),

  copyCredentialToClipboard: (serverId: string, vaultCredentialId: string) =>
    invoke<void>("copy_credential_to_clipboard", { serverId, vaultCredentialId }),

  deleteCredential: (vaultCredentialId: string, serverId?: string) =>
    invoke<void>("delete_credential", { vaultCredentialId, serverId }),

  isSetup: () =>
    invoke<boolean>("vault_is_setup"),

  isUnlocked: () =>
    invoke<boolean>("vault_is_unlocked"),

  isPasswordRequired: () =>
    invoke<boolean>("vault_is_password_required"),

  setup: (masterPassword: string) =>
    invoke<void>("vault_setup", { masterPassword }),

  skipSetup: () =>
    invoke<void>("vault_skip_setup"),

  unlock: (masterPassword: string) =>
    invoke<boolean>("vault_unlock", { masterPassword }),

  lock: () =>
    invoke<void>("vault_lock"),

  disablePassword: (currentPassword: string) =>
    invoke<void>("vault_disable_password", { currentPassword }),

  enablePassword: (newPassword: string) =>
    invoke<void>("vault_enable_password", { newPassword }),

  changePassword: (currentPassword: string, newPassword: string) =>
    invoke<void>("vault_change_password", { currentPassword, newPassword }),

  needsFormatUpgrade: () =>
    invoke<boolean>("vault_needs_format_upgrade"),

  setLockMenuEnabled: (enabled: boolean) =>
    invoke<void>("set_lock_vault_enabled", { enabled }),
};

export const backupCommands = {
  backupVaultDb: (destPath: string) =>
    invoke<void>("backup_vault_db", { destPath }),

  restoreVaultDb: (srcPath: string) =>
    invoke<void>("restore_vault_db", { srcPath }),
};
