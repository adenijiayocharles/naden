import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../lib/commands/settings", () => ({
  settingsCommands: {
    getSetting: vi.fn(),
    setSetting: vi.fn(),
  },
}));

import { useTerminalSettings } from "../lib/terminalSettings";
import { settingsCommands } from "../lib/commands/settings";

const mockGetSetting = vi.mocked(settingsCommands.getSetting);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSetting.mockResolvedValue(null);
});

describe("ghostSuggestions default", () => {
  it("is disabled before load() runs", () => {
    expect(useTerminalSettings.getState().ghostSuggestions).toBe(false);
  });

  it("stays disabled after load() finds no persisted setting", async () => {
    await useTerminalSettings.getState().load();

    expect(useTerminalSettings.getState().ghostSuggestions).toBe(false);
  });

  it("respects a persisted enabled setting", async () => {
    mockGetSetting.mockImplementation(async (key) =>
      key === "terminal_ghost_suggestions" ? "true" : null,
    );

    await useTerminalSettings.getState().load();

    expect(useTerminalSettings.getState().ghostSuggestions).toBe(true);
  });
});
