import { invoke } from "@tauri-apps/api/core";

export const terminalCommands = {
  openTerminalSession: (serverId: string, sessionId: string) =>
    invoke<void>("open_terminal_session", { serverId, sessionId }),

  openLocalSession: (sessionId: string, initialDir?: string) =>
    invoke<void>("open_local_session", { sessionId, initialDir: initialDir ?? null }),

  closeTerminalSession: (sessionId: string) =>
    invoke<void>("close_terminal_session", { sessionId }),

  sendTerminalInput: (sessionId: string, data: string) =>
    invoke<void>("send_terminal_input", { sessionId, data }),

  resizeTerminal: (sessionId: string, cols: number, rows: number) =>
    invoke<void>("resize_terminal", { sessionId, cols, rows }),

  removeKnownHostEntry: (serverId: string) =>
    invoke<number>("remove_known_host_entry", { serverId }),

  confirmHostKey: (sessionId: string, accepted: boolean) =>
    invoke<void>("confirm_host_key", { sessionId, accepted }),

  confirmHooks: (sessionId: string, accepted: boolean) =>
    invoke<void>("confirm_hooks", { sessionId, accepted }),
};
