import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("../lib/commands/vault", () => ({
  vaultCommands: {
    isSetup: vi.fn(),
    isUnlocked: vi.fn(),
    isPasswordRequired: vi.fn(),
    needsFormatUpgrade: vi.fn(),
    setup: vi.fn(),
    skipSetup: vi.fn(),
    unlock: vi.fn(),
    lock: vi.fn(),
    disablePassword: vi.fn(),
    enablePassword: vi.fn(),
    changePassword: vi.fn(),
  },
}));

import { vaultCommands } from "../lib/commands/vault";
import { useVaultStore } from "../store/vaultStore";

const mockIsSetup = vi.mocked(vaultCommands.isSetup);
const mockIsUnlocked = vi.mocked(vaultCommands.isUnlocked);
const mockIsPasswordRequired = vi.mocked(vaultCommands.isPasswordRequired);
const mockNeedsFormatUpgrade = vi.mocked(vaultCommands.needsFormatUpgrade);
const mockSetup = vi.mocked(vaultCommands.setup);
const mockSkipSetup = vi.mocked(vaultCommands.skipSetup);
const mockUnlock = vi.mocked(vaultCommands.unlock);
const mockLock = vi.mocked(vaultCommands.lock);
const mockDisablePassword = vi.mocked(vaultCommands.disablePassword);

const RESET_STATE = {
  isChecking: false,
  isUnlocked: false,
  isSetup: false,
  isPasswordRequired: true,
  needsFormatUpgrade: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  useVaultStore.setState(RESET_STATE);
});

describe("check()", () => {
  it("populates all state fields from the backend", async () => {
    mockIsSetup.mockResolvedValueOnce(true);
    mockIsUnlocked.mockResolvedValueOnce(true);
    mockIsPasswordRequired.mockResolvedValueOnce(false);
    mockNeedsFormatUpgrade.mockResolvedValueOnce(false);

    await useVaultStore.getState().check();

    expect(useVaultStore.getState()).toMatchObject({
      isSetup: true,
      isUnlocked: true,
      isPasswordRequired: false,
    });
  });

  it("sets isChecking=false after successful completion", async () => {
    mockIsSetup.mockResolvedValueOnce(false);
    mockIsUnlocked.mockResolvedValueOnce(false);
    mockIsPasswordRequired.mockResolvedValueOnce(true);
    mockNeedsFormatUpgrade.mockResolvedValueOnce(false);

    await useVaultStore.getState().check();

    expect(useVaultStore.getState().isChecking).toBe(false);
  });

  it("sets isChecking=false even when an invoke rejects", async () => {
    mockIsSetup.mockRejectedValueOnce(new Error("DB error"));
    mockIsUnlocked.mockResolvedValueOnce(false);
    mockIsPasswordRequired.mockResolvedValueOnce(true);

    await expect(useVaultStore.getState().check()).rejects.toThrow();

    expect(useVaultStore.getState().isChecking).toBe(false);
  });
});

describe("unlock()", () => {
  it("returns true and sets isUnlocked=true when backend returns true", async () => {
    mockUnlock.mockResolvedValueOnce(true);

    const result = await useVaultStore.getState().unlock("correct");

    expect(result).toBe(true);
    expect(useVaultStore.getState().isUnlocked).toBe(true);
  });

  it("returns false and leaves isUnlocked=false when backend returns false", async () => {
    mockUnlock.mockResolvedValueOnce(false);

    const result = await useVaultStore.getState().unlock("wrong");

    expect(result).toBe(false);
    expect(useVaultStore.getState().isUnlocked).toBe(false);
  });

  it("propagates lockout errors thrown by the backend", async () => {
    mockUnlock.mockRejectedValueOnce(
      new Error("too many failed attempts — please wait before trying again"),
    );

    await expect(useVaultStore.getState().unlock("wrong")).rejects.toThrow(
      "too many failed attempts",
    );
  });
});

describe("disablePassword()", () => {
  it("clears isPasswordRequired", async () => {
    useVaultStore.setState({ isPasswordRequired: true });
    mockDisablePassword.mockResolvedValueOnce(undefined);

    await useVaultStore.getState().disablePassword("correct");

    expect(useVaultStore.getState().isPasswordRequired).toBe(false);
  });

  it("sets isUnlocked=true after disabling", async () => {
    useVaultStore.setState({ isUnlocked: false });
    mockDisablePassword.mockResolvedValueOnce(undefined);

    await useVaultStore.getState().disablePassword("correct");

    expect(useVaultStore.getState().isUnlocked).toBe(true);
  });
});

describe("lock()", () => {
  it("sets isUnlocked=false regardless of prior state", async () => {
    useVaultStore.setState({ isUnlocked: true });
    mockLock.mockResolvedValueOnce(undefined);

    await useVaultStore.getState().lock();

    expect(useVaultStore.getState().isUnlocked).toBe(false);
  });
});

describe("setup()", () => {
  it("sets isSetup=true and isUnlocked=true", async () => {
    mockSetup.mockResolvedValueOnce(undefined);

    await useVaultStore.getState().setup("newpassword");

    expect(useVaultStore.getState()).toMatchObject({ isSetup: true, isUnlocked: true });
  });
});

describe("skipSetup()", () => {
  it("sets isPasswordRequired=false", async () => {
    mockSkipSetup.mockResolvedValueOnce(undefined);

    await useVaultStore.getState().skipSetup();

    expect(useVaultStore.getState().isPasswordRequired).toBe(false);
  });
});
