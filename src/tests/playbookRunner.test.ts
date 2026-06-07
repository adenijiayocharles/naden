import { describe, it, expect, vi } from "vitest";
import { runPlaybook, type PlaybookRunStatus } from "../lib/playbookRunner";
import type { Playbook } from "../types/playbook";

function makePlaybook(commands: string[]): Playbook {
  return {
    id: "pb-1",
    title: "Test playbook",
    description: null,
    steps: commands.map((command, i) => ({ id: `step-${i}`, position: i, command, delayMs: 0 })),
    createdAt: "",
    updatedAt: "",
  };
}

const noDelay = () => Promise.resolve();
const upperCaseResolve = (raw: string) => raw.toUpperCase();

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("runPlaybook", () => {
  it("sends each step's resolved command in order", async () => {
    const sent: string[] = [];
    const sendStep = vi.fn(async (cmd: string) => {
      sent.push(cmd);
    });

    runPlaybook({
      playbook: makePlaybook(["echo a", "echo b"]),
      resolveCommand: upperCaseResolve,
      sendStep,
      onStatusChange: () => {},
      delay: noDelay,
    });

    await flushMicrotasks();
    expect(sent).toEqual(["ECHO A", "ECHO B"]);
  });

  it("reports done after the last step completes", async () => {
    const statuses: PlaybookRunStatus[] = [];

    runPlaybook({
      playbook: makePlaybook(["echo a"]),
      resolveCommand: (raw) => raw,
      sendStep: async () => {},
      onStatusChange: (s) => statuses.push(s),
      delay: noDelay,
    });

    await flushMicrotasks();
    expect(statuses[statuses.length - 1]).toEqual({ kind: "done" });
  });

  it("pauses for confirmation when a resolved step is destructive", async () => {
    const statuses: PlaybookRunStatus[] = [];

    runPlaybook({
      playbook: makePlaybook(["rm -rf {{target}}"]),
      resolveCommand: (raw) => raw.replace("{{target}}", "/tmp/build"),
      sendStep: async () => {},
      onStatusChange: (s) => statuses.push(s),
      delay: noDelay,
    });

    await flushMicrotasks();
    expect(statuses[statuses.length - 1]).toEqual({
      kind: "awaiting-confirmation",
      stepIndex: 0,
      resolvedCommand: "rm -rf /tmp/build",
    });
  });

  it("sends the step once confirmed", async () => {
    const sent: string[] = [];
    const sendStep = vi.fn(async (cmd: string) => {
      sent.push(cmd);
    });

    const handle = runPlaybook({
      playbook: makePlaybook(["rm -rf /tmp/build"]),
      resolveCommand: (raw) => raw,
      sendStep,
      onStatusChange: () => {},
      delay: noDelay,
    });

    await flushMicrotasks();
    handle.confirm();
    await flushMicrotasks();

    expect(sent).toEqual(["rm -rf /tmp/build"]);
  });

  it("skips the step without sending when declined", async () => {
    const sendStep = vi.fn(async () => {});

    const handle = runPlaybook({
      playbook: makePlaybook(["rm -rf /tmp/build", "echo done"]),
      resolveCommand: (raw) => raw,
      sendStep,
      onStatusChange: () => {},
      delay: noDelay,
    });

    await flushMicrotasks();
    handle.skip();
    await flushMicrotasks();

    expect(sendStep).toHaveBeenCalledTimes(1);
    expect(sendStep).toHaveBeenCalledWith("echo done");
  });

  it("stops immediately when cancelled mid-run", async () => {
    const statuses: PlaybookRunStatus[] = [];
    const sendStep = vi.fn(async () => {});

    const handle = runPlaybook({
      playbook: makePlaybook(["echo a", "echo b", "echo c"]),
      resolveCommand: (raw) => raw,
      sendStep,
      onStatusChange: (s) => statuses.push(s),
      delay: noDelay,
    });

    handle.cancel();
    await flushMicrotasks();

    expect(statuses[statuses.length - 1]).toEqual({ kind: "cancelled" });
    expect(sendStep).not.toHaveBeenCalled();
  });
});
