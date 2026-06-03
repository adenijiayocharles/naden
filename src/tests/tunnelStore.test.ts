import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("../lib/tauriCommands", () => ({
  tunnelCommands: {
    listPortForwards: vi.fn(),
    createPortForward: vi.fn(),
    updatePortForward: vi.fn(),
    deletePortForward: vi.fn(),
    startTunnel: vi.fn(),
    stopTunnel: vi.fn(),
    listActiveTunnelIds: vi.fn(),
  },
}));

import { useTunnelStore } from "../store/tunnelStore";
import { tunnelCommands } from "../lib/tauriCommands";
import type { PortForward } from "../types/portForward";

const mockList = vi.mocked(tunnelCommands.listPortForwards);
const mockCreate = vi.mocked(tunnelCommands.createPortForward);
const mockUpdate = vi.mocked(tunnelCommands.updatePortForward);
const mockDelete = vi.mocked(tunnelCommands.deletePortForward);
const mockStart = vi.mocked(tunnelCommands.startTunnel);
const mockStop = vi.mocked(tunnelCommands.stopTunnel);
const mockActiveIds = vi.mocked(tunnelCommands.listActiveTunnelIds);

function makeFwd(overrides?: Partial<PortForward>): PortForward {
  return {
    id: "fwd-1",
    serverId: "srv-1",
    label: "",
    forwardType: "local",
    localPort: 5432,
    remoteHost: "db.internal",
    remotePort: 5432,
    autoStart: false,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useTunnelStore.setState({ forwards: [], statuses: {}, errors: {} });
});

describe("load()", () => {
  it("populates forwards and marks active tunnels", async () => {
    const fwd = makeFwd();
    mockList.mockResolvedValue([fwd]);
    mockActiveIds.mockResolvedValue(["fwd-1"]);

    await useTunnelStore.getState().load();

    expect(useTunnelStore.getState().forwards).toHaveLength(1);
    expect(useTunnelStore.getState().statuses["fwd-1"]).toBe("active");
  });

  it("marks inactive forwards as idle", async () => {
    mockList.mockResolvedValue([makeFwd()]);
    mockActiveIds.mockResolvedValue([]);

    await useTunnelStore.getState().load();

    expect(useTunnelStore.getState().statuses["fwd-1"]).toBe("idle");
  });

  it("merges server-scoped load without clobbering other servers' forwards", async () => {
    const other = makeFwd({ id: "fwd-2", serverId: "srv-2" });
    useTunnelStore.setState({ forwards: [other], statuses: { "fwd-2": "idle" } });

    mockList.mockResolvedValue([makeFwd()]);
    mockActiveIds.mockResolvedValue([]);

    await useTunnelStore.getState().load("srv-1");

    const ids = useTunnelStore.getState().forwards.map((f) => f.id);
    expect(ids).toContain("fwd-1");
    expect(ids).toContain("fwd-2");
  });
});

describe("create()", () => {
  it("adds the new forward to the store and sets status idle", async () => {
    const fwd = makeFwd();
    mockCreate.mockResolvedValue(fwd);
    mockActiveIds.mockResolvedValue([]);

    await useTunnelStore.getState().create({
      serverId: "srv-1",
      label: "",
      forwardType: "local",
      localPort: 5432,
      remoteHost: "db.internal",
      remotePort: 5432,
      autoStart: false,
    });

    expect(useTunnelStore.getState().forwards).toHaveLength(1);
    expect(useTunnelStore.getState().statuses["fwd-1"]).toBe("idle");
  });

  it("propagates backend errors", async () => {
    mockCreate.mockRejectedValue(new Error("validation failed"));
    await expect(
      useTunnelStore.getState().create({
        serverId: "srv-1",
        label: "",
        forwardType: "local",
        localPort: 99999,
        remoteHost: "",
        remotePort: 0,
        autoStart: false,
      })
    ).rejects.toThrow("validation failed");
  });
});

describe("update()", () => {
  it("replaces the forward in the store", async () => {
    useTunnelStore.setState({ forwards: [makeFwd()], statuses: { "fwd-1": "idle" } });
    const updated = makeFwd({ label: "Updated", localPort: 15432 });
    mockUpdate.mockResolvedValue(updated);

    await useTunnelStore.getState().update("fwd-1", {
      label: "Updated",
      forwardType: "local",
      localPort: 15432,
      remoteHost: "db.internal",
      remotePort: 5432,
      autoStart: false,
    });

    const fwd = useTunnelStore.getState().forwards.find((f) => f.id === "fwd-1")!;
    expect(fwd.label).toBe("Updated");
    expect(fwd.localPort).toBe(15432);
  });
});

describe("remove()", () => {
  it("removes forward and cleans up status/error entries", async () => {
    useTunnelStore.setState({
      forwards: [makeFwd()],
      statuses: { "fwd-1": "idle" },
      errors: {},
    });
    mockDelete.mockResolvedValue(undefined);
    mockStop.mockResolvedValue(undefined);

    await useTunnelStore.getState().remove("fwd-1");

    expect(useTunnelStore.getState().forwards).toHaveLength(0);
    expect(useTunnelStore.getState().statuses["fwd-1"]).toBeUndefined();
  });

  it("stops an active tunnel before deleting", async () => {
    useTunnelStore.setState({
      forwards: [makeFwd()],
      statuses: { "fwd-1": "active" },
    });
    mockStop.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);

    await useTunnelStore.getState().remove("fwd-1");

    expect(mockStop).toHaveBeenCalledWith("fwd-1");
    expect(mockDelete).toHaveBeenCalledWith("fwd-1");
  });

  it("does not call stop for an idle tunnel", async () => {
    useTunnelStore.setState({
      forwards: [makeFwd()],
      statuses: { "fwd-1": "idle" },
    });
    mockDelete.mockResolvedValue(undefined);

    await useTunnelStore.getState().remove("fwd-1");

    expect(mockStop).not.toHaveBeenCalled();
  });
});

describe("startTunnel()", () => {
  it("sets status to connecting while the command is in-flight", async () => {
    useTunnelStore.setState({ forwards: [makeFwd()], statuses: { "fwd-1": "idle" } });

    let resolveStart!: () => void;
    mockStart.mockReturnValue(new Promise<void>((r) => { resolveStart = r; }));

    const promise = useTunnelStore.getState().startTunnel("fwd-1");
    expect(useTunnelStore.getState().statuses["fwd-1"]).toBe("connecting");

    resolveStart();
    await promise;
  });

  it("sets status to error and stores message when start fails", async () => {
    useTunnelStore.setState({ forwards: [makeFwd()], statuses: { "fwd-1": "idle" } });
    mockStart.mockRejectedValue(new Error("SSH failed"));

    await expect(useTunnelStore.getState().startTunnel("fwd-1")).rejects.toThrow();

    expect(useTunnelStore.getState().statuses["fwd-1"]).toBe("error");
    expect(useTunnelStore.getState().errors["fwd-1"]).toBeDefined();
  });
});

describe("stopTunnel()", () => {
  it("sets status to idle after stop", async () => {
    useTunnelStore.setState({ forwards: [makeFwd()], statuses: { "fwd-1": "active" } });
    mockStop.mockResolvedValue(undefined);

    await useTunnelStore.getState().stopTunnel("fwd-1");

    expect(useTunnelStore.getState().statuses["fwd-1"]).toBe("idle");
  });
});

describe("refreshActiveTunnels()", () => {
  it("updates statuses from the active-ids list without touching connecting state", async () => {
    useTunnelStore.setState({
      forwards: [makeFwd(), makeFwd({ id: "fwd-2" })],
      statuses: { "fwd-1": "active", "fwd-2": "connecting" },
    });
    mockActiveIds.mockResolvedValue(["fwd-1"]);

    await useTunnelStore.getState().refreshActiveTunnels();

    expect(useTunnelStore.getState().statuses["fwd-1"]).toBe("active");
    // fwd-2 is connecting so refresh should not override it
    expect(useTunnelStore.getState().statuses["fwd-2"]).toBe("connecting");
  });

  it("marks a no-longer-active tunnel as idle", async () => {
    useTunnelStore.setState({
      forwards: [makeFwd()],
      statuses: { "fwd-1": "active" },
    });
    mockActiveIds.mockResolvedValue([]);

    await useTunnelStore.getState().refreshActiveTunnels();

    expect(useTunnelStore.getState().statuses["fwd-1"]).toBe("idle");
  });
});
