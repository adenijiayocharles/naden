import { invoke } from "@tauri-apps/api/core";
import type { Snippet, CreateSnippetPayload, UpdateSnippetPayload } from "../../types/snippet";
import type { Playbook, CreatePlaybookPayload, UpdatePlaybookPayload } from "../../types/playbook";

export const snippetCommands = {
  listSnippets: () =>
    invoke<Snippet[]>("list_snippets"),

  createSnippet: (payload: CreateSnippetPayload) =>
    invoke<Snippet>("create_snippet", { payload }),

  updateSnippet: (id: string, payload: UpdateSnippetPayload) =>
    invoke<Snippet>("update_snippet", { id, payload }),

  deleteSnippet: (id: string) =>
    invoke<void>("delete_snippet", { id }),
};

export const playbookCommands = {
  listPlaybooks: () =>
    invoke<Playbook[]>("list_playbooks"),

  createPlaybook: (payload: CreatePlaybookPayload) =>
    invoke<Playbook>("create_playbook", { payload }),

  updatePlaybook: (id: string, payload: UpdatePlaybookPayload) =>
    invoke<Playbook>("update_playbook", { id, payload }),

  deletePlaybook: (id: string) =>
    invoke<void>("delete_playbook", { id }),
};
