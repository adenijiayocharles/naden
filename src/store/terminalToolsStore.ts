import { create } from "zustand";

export type TerminalTool = "assistant" | "playbooks" | "snippets" | "tunnels";

interface TerminalToolsStore {
  openTool: TerminalTool | null;
  toggleTool: (tool: TerminalTool) => void;
  closeTool: () => void;
}

// Shared between AppShell (tab bar trigger buttons) and TerminalPane (popup
// content) — only one tool panel can be open at a time.
export const useTerminalToolsStore = create<TerminalToolsStore>((set) => ({
  openTool: null,
  toggleTool: (tool) => set((s) => ({ openTool: s.openTool === tool ? null : tool })),
  closeTool: () => set({ openTool: null }),
}));
