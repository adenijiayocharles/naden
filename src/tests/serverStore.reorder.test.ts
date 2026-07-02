import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("../lib/commands/server", () => ({
  serverCommands: {
    reorderServers: vi.fn().mockResolvedValue(undefined),
  },
}));

import { serverCommands } from "../lib/commands/server";
import { useServerStore } from "../store/serverStore";
import type { Server } from "../types/server";

const mockReorderServers = vi.mocked(serverCommands.reorderServers);

function makeServer(id: string, displayName: string): Server {
  return {
    id,
    displayName,
    hostname: `${id}.example.com`,
    port: 22,
    username: "ubuntu",
    authMethod: "key",
    isJumpHost: false,
    isFavourite: false,
    tags: [],
    sortPosition: 0,
  } as unknown as Server;
}

const INITIAL_SERVERS = [
  makeServer("a", "Alpha"),
  makeServer("b", "Beta"),
  makeServer("c", "Gamma"),
];

beforeEach(() => {
  vi.clearAllMocks();
  useServerStore.setState({ servers: [...INITIAL_SERVERS] } as never);
});

describe("reorderServers()", () => {
  it("reorders servers in-store immediately (optimistic)", async () => {
    const promise = useServerStore.getState().reorderServers(["c", "a", "b"]);

    const names = useServerStore.getState().servers.map((s) => s.displayName);
    expect(names).toEqual(["Gamma", "Alpha", "Beta"]);

    await promise;
  });

  it("persists the new order via the backend command", async () => {
    await useServerStore.getState().reorderServers(["b", "c", "a"]);

    expect(mockReorderServers).toHaveBeenCalledOnce();
    expect(mockReorderServers).toHaveBeenCalledWith(["b", "c", "a"]);
  });

  it("ids not in the list are appended after the reordered ones", async () => {
    await useServerStore.getState().reorderServers(["c", "a"]);

    const ids = useServerStore.getState().servers.map((s) => s.id);
    expect(ids).toEqual(["c", "a", "b"]);
  });
});
