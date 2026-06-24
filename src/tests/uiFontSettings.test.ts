import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../lib/tauriCommands", () => ({
  settingsCommands: {
    getSetting: vi.fn(),
    setSetting: vi.fn(),
  },
}));

import { useUiFontSettings } from "../lib/uiFontSettings";
import { settingsCommands } from "../lib/tauriCommands";

const mockGetSetting = vi.mocked(settingsCommands.getSetting);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSetting.mockResolvedValue(null);
});

describe("fontFamily default", () => {
  it("is system before load() runs", () => {
    expect(useUiFontSettings.getState().fontFamily).toBe("system");
  });

  it("stays system after load() finds no persisted setting", async () => {
    await useUiFontSettings.getState().load();

    expect(useUiFontSettings.getState().fontFamily).toBe("system");
  });

  it("respects a persisted font family", async () => {
    mockGetSetting.mockImplementation(async (key) =>
      key === "ui_font_family" ? "geist" : null,
    );

    await useUiFontSettings.getState().load();

    expect(useUiFontSettings.getState().fontFamily).toBe("geist");
  });
});

describe("fontSize default", () => {
  it("is 14 before load() runs", () => {
    expect(useUiFontSettings.getState().fontSize).toBe(14);
  });

  it("respects a persisted font size", async () => {
    mockGetSetting.mockImplementation(async (key) =>
      key === "ui_font_size" ? "18" : null,
    );

    await useUiFontSettings.getState().load();

    expect(useUiFontSettings.getState().fontSize).toBe(18);
  });
});

describe("setFontFamily", () => {
  it("persists the chosen font family", () => {
    useUiFontSettings.getState().setFontFamily("manrope");

    expect(settingsCommands.setSetting).toHaveBeenCalledWith("ui_font_family", "manrope");
  });
});

describe("setFontSize", () => {
  it("persists the chosen font size", () => {
    useUiFontSettings.getState().setFontSize(20);

    expect(settingsCommands.setSetting).toHaveBeenCalledWith("ui_font_size", "20");
  });
});
