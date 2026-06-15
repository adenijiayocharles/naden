import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: vi.fn(),
  message: vi.fn(),
}));

vi.mock("../lib/tauriCommands", () => ({
  updaterCommands: {
    checkForUpdate: vi.fn(),
    relaunch: vi.fn(),
  },
}));

import { ask, message } from "@tauri-apps/plugin-dialog";
import { updaterCommands } from "../lib/tauriCommands";
import { promptForUpdate } from "../lib/checkForUpdates";

const mockAsk = vi.mocked(ask);
const mockMessage = vi.mocked(message);
const mockCheckForUpdate = vi.mocked(updaterCommands.checkForUpdate);
const mockRelaunch = vi.mocked(updaterCommands.relaunch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("promptForUpdate", () => {
  it("reports up to date when no update is available", async () => {
    mockCheckForUpdate.mockResolvedValue(null);

    await promptForUpdate();

    expect(mockMessage).toHaveBeenCalledWith(
      "You're on the latest version.",
      expect.objectContaining({ title: "naden" }),
    );
  });

  it("stays silent when no update is available and silent is requested", async () => {
    mockCheckForUpdate.mockResolvedValue(null);

    await promptForUpdate({ silent: true });

    expect(mockMessage).not.toHaveBeenCalled();
  });

  it("downloads and relaunches when the user accepts an available update", async () => {
    const download = vi.fn().mockResolvedValue(undefined);
    mockCheckForUpdate.mockResolvedValue({ version: "1.2.3", download });
    mockAsk.mockResolvedValue(true);

    await promptForUpdate();

    expect(download).toHaveBeenCalled();
    expect(mockRelaunch).toHaveBeenCalled();
  });

  it("does not download when the user declines the available update", async () => {
    const download = vi.fn().mockResolvedValue(undefined);
    mockCheckForUpdate.mockResolvedValue({ version: "1.2.3", download });
    mockAsk.mockResolvedValue(false);

    await promptForUpdate();

    expect(download).not.toHaveBeenCalled();
    expect(mockRelaunch).not.toHaveBeenCalled();
  });

  it("does not relaunch when the user declines the restart prompt", async () => {
    const download = vi.fn().mockResolvedValue(undefined);
    mockCheckForUpdate.mockResolvedValue({ version: "1.2.3", download });
    mockAsk.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await promptForUpdate();

    expect(download).toHaveBeenCalled();
    expect(mockRelaunch).not.toHaveBeenCalled();
  });

  it("shows an error dialog when the check fails", async () => {
    mockCheckForUpdate.mockRejectedValue(new Error("network unreachable"));

    await promptForUpdate();

    expect(mockMessage).toHaveBeenCalledWith(
      "network unreachable",
      expect.objectContaining({ title: "Update Check Failed", kind: "error" }),
    );
  });

  it("stays silent when the check fails and silent is requested", async () => {
    mockCheckForUpdate.mockRejectedValue(new Error("network unreachable"));

    await promptForUpdate({ silent: true });

    expect(mockMessage).not.toHaveBeenCalled();
  });
});
