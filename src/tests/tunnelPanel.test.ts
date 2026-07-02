import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Tauri APIs used by tunnelStore on import
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("../lib/commands/tunnels", () => ({
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
import { useUiStore } from "../store/uiStore";
import type { PortForward } from "../types/portForward";

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
  useUiStore.setState({ activeView: "list" });
});

describe("uiStore — tunnels view", () => {
  it("openTunnels sets activeView to 'tunnels'", () => {
    useUiStore.getState().openTunnels();
    expect(useUiStore.getState().activeView).toBe("tunnels");
  });

  it("closeForm returns to list from tunnels", () => {
    useUiStore.getState().openTunnels();
    useUiStore.getState().closeForm();
    expect(useUiStore.getState().activeView).toBe("list");
  });

  it("openLogs overrides tunnels view", () => {
    useUiStore.getState().openTunnels();
    useUiStore.getState().openLogs();
    expect(useUiStore.getState().activeView).toBe("logs");
  });
});

describe("active tunnel badge logic", () => {
  it("server has no active tunnel when no forwards exist", () => {
    useTunnelStore.setState({ forwards: [], statuses: {} });
    const hasActive = useTunnelStore
      .getState()
      .forwards.some((f) => f.serverId === "srv-1" && useTunnelStore.getState().statuses[f.id] === "active");
    expect(hasActive).toBe(false);
  });

  it("server has active tunnel when one forward is active", () => {
    useTunnelStore.setState({
      forwards: [makeFwd()],
      statuses: { "fwd-1": "active" },
    });
    const hasActive = useTunnelStore
      .getState()
      .forwards.some((f) => f.serverId === "srv-1" && useTunnelStore.getState().statuses[f.id] === "active");
    expect(hasActive).toBe(true);
  });

  it("server has no active tunnel when forward is idle", () => {
    useTunnelStore.setState({
      forwards: [makeFwd()],
      statuses: { "fwd-1": "idle" },
    });
    const hasActive = useTunnelStore
      .getState()
      .forwards.some((f) => f.serverId === "srv-1" && useTunnelStore.getState().statuses[f.id] === "active");
    expect(hasActive).toBe(false);
  });

  it("server has no active tunnel when another server's forward is active", () => {
    useTunnelStore.setState({
      forwards: [makeFwd({ serverId: "srv-2" })],
      statuses: { "fwd-1": "active" },
    });
    const hasActive = useTunnelStore
      .getState()
      .forwards.some((f) => f.serverId === "srv-1" && useTunnelStore.getState().statuses[f.id] === "active");
    expect(hasActive).toBe(false);
  });
});

describe("sidebar active tunnel count", () => {
  it("counts only active (not connecting or idle) tunnels", () => {
    useTunnelStore.setState({
      forwards: [
        makeFwd({ id: "f1" }),
        makeFwd({ id: "f2" }),
        makeFwd({ id: "f3" }),
      ],
      statuses: { f1: "active", f2: "connecting", f3: "idle" },
    });
    const activeCount = Object.values(useTunnelStore.getState().statuses).filter(
      (s) => s === "active"
    ).length;
    expect(activeCount).toBe(1);
  });

  it("returns 0 when no tunnels are active", () => {
    useTunnelStore.setState({
      forwards: [makeFwd()],
      statuses: { "fwd-1": "idle" },
    });
    const activeCount = Object.values(useTunnelStore.getState().statuses).filter(
      (s) => s === "active"
    ).length;
    expect(activeCount).toBe(0);
  });
});
