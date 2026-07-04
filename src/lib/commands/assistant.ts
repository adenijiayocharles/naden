import { invoke } from "@tauri-apps/api/core";

export interface AssistantStatus {
  openaiConfigured: boolean;
  anthropicConfigured: boolean;
  openrouterConfigured: boolean;
  geminiConfigured: boolean;
  activeProvider: string | null;
  enabled: boolean;
  persistHistory: boolean;
}

export interface AssistantChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const assistantCommands = {
  setApiKey: (provider: string, apiKey: string) =>
    invoke<void>("set_assistant_api_key", { provider, apiKey }),

  clearApiKey: () =>
    invoke<void>("clear_assistant_api_key"),

  clearProviderKey: (provider: string) =>
    invoke<void>("clear_assistant_provider_key", { provider }),

  switchProvider: (provider: string) =>
    invoke<void>("switch_assistant_provider", { provider }),

  setEnabled: (enabled: boolean) =>
    invoke<void>("set_assistant_enabled", { enabled }),

  getStatus: () =>
    invoke<AssistantStatus>("get_assistant_status"),

  // Dispatches the conversation and returns immediately — the reply streams
  // back via assistant:token/done/error:{requestId} events (see assistantStore).
  sendMessage: (requestId: string, messages: AssistantChatMessage[]) =>
    invoke<void>("send_assistant_message", { requestId, messages }),

  setPersistHistory: (enabled: boolean) =>
    invoke<void>("set_assistant_persist_history", { enabled }),

  // `payload` is a JSON-serialised per-server transcript, encrypted at rest
  // through the vault before it touches disk (see assistantStore).
  saveChatHistory: (serverId: string, payload: string) =>
    invoke<void>("save_assistant_chat_history", { serverId, payload }),

  loadChatHistory: (serverId: string) =>
    invoke<string | null>("load_assistant_chat_history", { serverId }),
};
