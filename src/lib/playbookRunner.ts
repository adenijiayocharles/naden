import { isDestructiveCommand } from "./destructiveCommands";
import type { Playbook } from "../types/playbook";

export type PlaybookRunStatus =
  | { kind: "running"; stepIndex: number }
  | { kind: "awaiting-confirmation"; stepIndex: number; resolvedCommand: string }
  | { kind: "done" }
  | { kind: "cancelled" };

export interface PlaybookRunHandle {
  cancel: () => void;
  /** Resolves a step paused by the destructive guard; no-op otherwise. */
  confirm: () => void;
  /** Skips a step paused by the destructive guard; no-op otherwise. */
  skip: () => void;
}

interface RunPlaybookOptions {
  playbook: Playbook;
  /** Binds {{placeholders}} to this run's target(s); called once per step. */
  resolveCommand: (rawCommand: string) => string;
  /** Delivers one resolved command (without trailing newline) to the target(s). */
  sendStep: (resolvedCommand: string) => Promise<void>;
  onStatusChange: (status: PlaybookRunStatus) => void;
  delay?: (ms: number) => Promise<void>;
}

const defaultDelay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Sequences a playbook's steps: resolve variables, pause for confirmation on a
 * destructive match, send, then wait the step's configured delay before the next.
 * Deliberately decoupled from *where* input goes — callers supply sendStep so the
 * same sequencer drives both single-pane runs and per-pane broadcast fan-out.
 */
export function runPlaybook(options: RunPlaybookOptions): PlaybookRunHandle {
  const { playbook, resolveCommand, sendStep, onStatusChange, delay = defaultDelay } = options;

  let cancelled = false;
  let confirmation: ((proceed: boolean) => void) | null = null;

  const cancel = () => {
    cancelled = true;
    confirmation?.(false);
  };
  const confirm = () => confirmation?.(true);
  const skip = () => confirmation?.(false);

  void (async () => {
    // Yield once so a cancel() called immediately after runPlaybook() returns
    // is observed before the first step starts, rather than racing it.
    await Promise.resolve();

    for (let i = 0; i < playbook.steps.length; i++) {
      if (cancelled) {
        onStatusChange({ kind: "cancelled" });
        return;
      }

      const step = playbook.steps[i];
      const resolved = resolveCommand(step.command);

      if (isDestructiveCommand(resolved)) {
        onStatusChange({ kind: "awaiting-confirmation", stepIndex: i, resolvedCommand: resolved });
        const proceed = await new Promise<boolean>((resolve) => {
          confirmation = resolve;
        });
        confirmation = null;

        if (cancelled) {
          onStatusChange({ kind: "cancelled" });
          return;
        }
        if (!proceed) continue;
      }

      onStatusChange({ kind: "running", stepIndex: i });
      await sendStep(resolved);
      await delay(step.delayMs);
    }

    if (!cancelled) onStatusChange({ kind: "done" });
  })();

  return { cancel, confirm, skip };
}
