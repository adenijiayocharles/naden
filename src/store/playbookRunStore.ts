import { create } from "zustand";
import { runPlaybook, type PlaybookRunHandle, type PlaybookRunStatus } from "../lib/playbookRunner";
import type { Playbook } from "../types/playbook";

interface PlaybookRunState {
  playbook: Playbook | null;
  status: PlaybookRunStatus | null;
  handle: PlaybookRunHandle | null;

  start: (
    playbook: Playbook,
    resolveCommand: (rawCommand: string) => string,
    sendStep: (resolvedCommand: string) => Promise<void>,
  ) => void;
  cancel: () => void;
  confirm: () => void;
  skip: () => void;
  dismiss: () => void;
}

export const usePlaybookRunStore = create<PlaybookRunState>((set, get) => ({
  playbook: null,
  status: null,
  handle: null,

  start: (playbook, resolveCommand, sendStep) => {
    get().handle?.cancel();

    const handle = runPlaybook({
      playbook,
      resolveCommand,
      sendStep,
      onStatusChange: (status) => set({ status }),
    });

    set({ playbook, handle, status: { kind: "running", stepIndex: 0 } });
  },

  cancel: () => get().handle?.cancel(),
  confirm: () => get().handle?.confirm(),
  skip: () => get().handle?.skip(),

  dismiss: () => set({ playbook: null, status: null, handle: null }),
}));
