import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("../lib/tauriCommands", () => ({
  terminalCommands: {
    openTerminalSession: vi.fn(),
    openLocalSession: vi.fn(),
    closeTerminalSession: vi.fn(),
    sendTerminalInput: vi.fn(),
    resizeTerminal: vi.fn(),
    removeKnownHostEntry: vi.fn(),
    confirmHostKey: vi.fn(),
  },
}));

import { listen } from "@tauri-apps/api/event";
import { useTerminalStore, LOCAL_SESSION_SERVER_ID } from "../store/terminalStore";
import { terminalCommands } from "../lib/tauriCommands";

const mockListen = vi.mocked(listen);
const mockOpenTerminalSession = vi.mocked(terminalCommands.openTerminalSession);
const mockOpenLocalSession = vi.mocked(terminalCommands.openLocalSession);

// Finds the callback the store registered via listen(`${prefix}:${sessionId}`, cb)
// and invokes it, mirroring a Rust-side emit for that session.
async function fireEvent(prefix: string, sessionId: string, payload: unknown) {
  const call = mockListen.mock.calls.find(([name]) => name === `${prefix}:${sessionId}`);
  if (!call) throw new Error(`no listener registered for ${prefix}:${sessionId}`);
  await call[1]({ payload } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOpenTerminalSession.mockResolvedValue(undefined);
  mockOpenLocalSession.mockResolvedValue(undefined);
  useTerminalStore.setState({ sessions: [], activeSessionId: null });
});

describe("openSession()", () => {
  it("creates a session with kind ssh", async () => {
    await useTerminalStore.getState().openSession("srv-1", "My Server");

    expect(useTerminalStore.getState().sessions[0].kind).toBe("ssh");
  });
});

describe("openLocalSession()", () => {
  it("creates a session with kind local", async () => {
    await useTerminalStore.getState().openLocalSession();

    expect(useTerminalStore.getState().sessions[0].kind).toBe("local");
  });

  it("uses the reserved local-shell server id", async () => {
    await useTerminalStore.getState().openLocalSession();

    expect(useTerminalStore.getState().sessions[0].serverId).toBe(LOCAL_SESSION_SERVER_ID);
  });

  it("starts in connecting status", async () => {
    await useTerminalStore.getState().openLocalSession();

    expect(useTerminalStore.getState().sessions[0].status).toBe("connecting");
  });

  it("makes the new tab active", async () => {
    const id = await useTerminalStore.getState().openLocalSession();

    expect(useTerminalStore.getState().activeSessionId).toBe(id);
  });

  it("invokes the open_local_session backend command", async () => {
    const id = await useTerminalStore.getState().openLocalSession();

    expect(mockOpenLocalSession).toHaveBeenCalledWith(id);
  });

  it("returns null without invoking the backend once MAX_TABS is reached", async () => {
    useTerminalStore.setState({
      sessions: Array.from({ length: 20 }, (_, i) => ({
        id: `s${i}`,
        kind: "local" as const,
        serverId: LOCAL_SESSION_SERVER_ID,
        serverName: "Local Shell",
        status: "connected" as const,
      })),
    });

    const id = await useTerminalStore.getState().openLocalSession();

    expect(id).toBeNull();
  });

  it("moves status to connected on a terminal:status connected event", async () => {
    const id = await useTerminalStore.getState().openLocalSession();

    await fireEvent("terminal:status", id!, "connected");

    expect(useTerminalStore.getState().sessions[0].status).toBe("connected");
  });

  it("removes the tab when the backend invoke rejects", async () => {
    mockOpenLocalSession.mockRejectedValue(new Error("failed to start local shell"));

    await expect(useTerminalStore.getState().openLocalSession()).rejects.toThrow(
      "failed to start local shell",
    );
    expect(useTerminalStore.getState().sessions).toHaveLength(0);
  });
});

describe("local session terminal:closed handling", () => {
  it("removes the tab when the shell exits while connected", async () => {
    const id = await useTerminalStore.getState().openLocalSession();
    await fireEvent("terminal:status", id!, "connected");

    await fireEvent("terminal:closed", id!, true);

    expect(useTerminalStore.getState().sessions).toHaveLength(0);
  });

  it("removes the tab when closed while still connecting", async () => {
    const id = await useTerminalStore.getState().openLocalSession();

    await fireEvent("terminal:closed", id!, false);

    expect(useTerminalStore.getState().sessions).toHaveLength(0);
  });

  it("keeps the tab when the session never connected and is showing an error", async () => {
    const id = await useTerminalStore.getState().openLocalSession();
    await fireEvent("terminal:error", id!, "failed to allocate local PTY");

    await fireEvent("terminal:closed", id!, false);

    expect(useTerminalStore.getState().sessions).toHaveLength(1);
  });

  it("does not schedule a reconnect countdown for a dropped local session", async () => {
    const id = await useTerminalStore.getState().openLocalSession();
    await fireEvent("terminal:status", id!, "connected");

    await fireEvent("terminal:closed", id!, false);

    // SSH sessions get reconnectAt set on unexpected drop; local sessions never should.
    expect(useTerminalStore.getState().sessions.find((s) => s.id === id)).toBeUndefined();
  });
});

describe("reconnectSession()", () => {
  it("reopens a local session via openLocalSession, not the SSH command", async () => {
    const id = await useTerminalStore.getState().openLocalSession();
    await fireEvent("terminal:error", id!, "failed to allocate local PTY");
    await fireEvent("terminal:closed", id!, false);

    await useTerminalStore.getState().reconnectSession(id!);

    expect(mockOpenLocalSession).toHaveBeenCalledTimes(2);
    expect(mockOpenTerminalSession).not.toHaveBeenCalled();
  });

  it("reopens an ssh session via the SSH command, not openLocalSession", async () => {
    const id = await useTerminalStore.getState().openSession("srv-1", "My Server");

    await useTerminalStore.getState().reconnectSession(id!);

    expect(mockOpenTerminalSession).toHaveBeenCalledTimes(2);
    expect(mockOpenLocalSession).not.toHaveBeenCalled();
  });
});
