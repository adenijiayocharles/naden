import { invoke } from "@tauri-apps/api/core";
import type { SshKey } from "../../types/sshKey";

export const keyCommands = {
  listSshKeys: () =>
    invoke<SshKey[]>("list_ssh_keys"),

  addSshKey: (path: string, name?: string) =>
    invoke<SshKey>("add_ssh_key", { path, name: name ?? null }),

  removeSshKey: (id: string) =>
    invoke<void>("remove_ssh_key", { id }),

  generateSshKey: (name: string, keyType: string, outputPath: string, passphrase?: string) =>
    invoke<SshKey>("generate_ssh_key", { name, keyType, outputPath, passphrase: passphrase ?? null }),

  getPublicKey: (id: string) =>
    invoke<string>("get_public_key", { id }),

  renameSshKey: (id: string, name: string) =>
    invoke<SshKey>("rename_ssh_key", { id, name }),
};
