import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("../lib/commands/terminal", () => ({
  terminalCommands: {
    sendTerminalInput: vi.fn(),
  },
}));
vi.mock("../lib/commands/broadcast", () => ({
  broadcastCommands: {
    listBroadcastGroups: vi.fn(),
    createBroadcastGroup: vi.fn(),
    updateBroadcastGroup: vi.fn(),
    deleteBroadcastGroup: vi.fn(),
  },
}));

import { useBroadcastStore } from "../store/broadcastStore";
import { useTerminalStore } from "../store/terminalStore";
import { terminalCommands } from "../lib/commands/terminal";

const mockSendTerminalInput = vi.mocked(terminalCommands.sendTerminalInput);

beforeEach(() => {
  vi.clearAllMocks();
  useBroadcastStore.setState({ groups: [], activeGroupId: null, excludedSessionIds: new Set(), pendingInput: null });
  useTerminalStore.setState({
    sessions: [
      { id: "s1", kind: "ssh", serverId: "srv-1", serverName: "one", status: "connected", broadcastGroupId: "g1" },
      { id: "s2", kind: "ssh", serverId: "srv-2", serverName: "two", status: "connected", broadcastGroupId: "g1" },
    ],
    activeSessionId: null,
  } as never);
  useBroadcastStore.setState({
    groups: [{ id: "g1", name: "group", sessionIds: ["s1", "s2"] }],
    activeGroupId: "g1",
  });
});

describe("broadcastInput()", () => {
  it("forwards an ordinary keystroke immediately, with no completed command", async () => {
    await useBroadcastStore.getState().broadcastInput("r");

    expect(mockSendTerminalInput).toHaveBeenCalledWith("s1", "r");
  });

  it("forwards each keystroke of a destructive command as it's typed, since nothing has executed yet", async () => {
    for (const ch of "rm -rf /".split("")) {
      await useBroadcastStore.getState().broadcastInput(ch);
    }

    expect(mockSendTerminalInput).toHaveBeenCalledTimes(2 * "rm -rf /".length);
  });

  it("holds the Enter keystroke back for confirmation once the completed line is destructive", async () => {
    await useBroadcastStore.getState().broadcastInput("\r", "rm -rf /var/www");

    expect(useBroadcastStore.getState().pendingInput).toBe("\r");
  });

  it("does not forward the held Enter keystroke until confirmed", async () => {
    await useBroadcastStore.getState().broadcastInput("\r", "rm -rf /var/www");

    expect(mockSendTerminalInput).not.toHaveBeenCalled();
  });

  it("sends the held Enter keystroke to every session once confirmed", async () => {
    await useBroadcastStore.getState().broadcastInput("\r", "rm -rf /var/www");
    await useBroadcastStore.getState().confirmPendingInput();

    expect(mockSendTerminalInput).toHaveBeenCalledWith("s2", "\r");
  });

  it("clears pendingInput without sending anything when cancelled", async () => {
    await useBroadcastStore.getState().broadcastInput("\r", "rm -rf /var/www");
    useBroadcastStore.getState().cancelPendingInput();

    expect(useBroadcastStore.getState().pendingInput).toBeNull();
  });
});
