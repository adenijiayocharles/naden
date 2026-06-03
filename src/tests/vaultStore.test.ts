import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("../lib/tauriCommands", () => ({
  vaultCommands: {
    biometricAvailable: vi.fn(),
    biometricEnabled: vi.fn(),
    enableBiometric: vi.fn(),
    disableBiometric: vi.fn(),
    unlockBiometric: vi.fn(),
    storeCredential: vi.fn(),
    retrieveCredential: vi.fn(),
    deleteCredential: vi.fn(),
  },
}));

import { invoke } from "@tauri-apps/api/core";
import { vaultCommands } from "../lib/tauriCommands";
import { useVaultStore } from "../store/vaultStore";

const mockInvoke = vi.mocked(invoke);
const mockBiometricAvailable = vi.mocked(vaultCommands.biometricAvailable);
const mockBiometricEnabled = vi.mocked(vaultCommands.biometricEnabled);
const mockEnableBiometric = vi.mocked(vaultCommands.enableBiometric);
const mockDisableBiometric = vi.mocked(vaultCommands.disableBiometric);
const mockUnlockBiometric = vi.mocked(vaultCommands.unlockBiometric);

const RESET_STATE = {
  isChecking: false,
  isUnlocked: false,
  isSetup: false,
  isPasswordRequired: true,
  isBiometricAvailable: false,
  isBiometricEnabled: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  useVaultStore.setState(RESET_STATE);
});

describe("check()", () => {
  it("populates all 5 state fields from the backend", async () => {
    mockInvoke
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    mockBiometricAvailable.mockResolvedValueOnce(true);
    mockBiometricEnabled.mockResolvedValueOnce(true);

    await useVaultStore.getState().check();

    expect(useVaultStore.getState()).toMatchObject({
      isSetup: true,
      isUnlocked: true,
      isPasswordRequired: false,
      isBiometricAvailable: true,
      isBiometricEnabled: true,
    });
  });

  it("sets isChecking=false after successful completion", async () => {
    mockInvoke
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    mockBiometricAvailable.mockResolvedValueOnce(false);
    mockBiometricEnabled.mockResolvedValueOnce(false);

    await useVaultStore.getState().check();

    expect(useVaultStore.getState().isChecking).toBe(false);
  });

  it("sets isChecking=false even when an invoke rejects", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("DB error"));

    await expect(useVaultStore.getState().check()).rejects.toThrow();

    expect(useVaultStore.getState().isChecking).toBe(false);
  });
});

describe("unlock()", () => {
  it("returns true and sets isUnlocked=true when backend returns true", async () => {
    mockInvoke.mockResolvedValueOnce(true);

    const result = await useVaultStore.getState().unlock("correct");

    expect(result).toBe(true);
    expect(useVaultStore.getState().isUnlocked).toBe(true);
  });

  it("returns false and leaves isUnlocked=false when backend returns false", async () => {
    mockInvoke.mockResolvedValueOnce(false);

    const result = await useVaultStore.getState().unlock("wrong");

    expect(result).toBe(false);
    expect(useVaultStore.getState().isUnlocked).toBe(false);
  });

  it("propagates lockout errors thrown by the backend", async () => {
    mockInvoke.mockRejectedValueOnce(
      new Error("too many failed attempts — please wait before trying again"),
    );

    await expect(useVaultStore.getState().unlock("wrong")).rejects.toThrow(
      "too many failed attempts",
    );
  });
});

describe("unlockBiometric()", () => {
  it("sets isUnlocked=true on success", async () => {
    mockUnlockBiometric.mockResolvedValueOnce(undefined);

    await useVaultStore.getState().unlockBiometric();

    expect(useVaultStore.getState().isUnlocked).toBe(true);
  });

  it("does NOT set isUnlocked when command throws", async () => {
    mockUnlockBiometric.mockRejectedValueOnce(new Error("Touch ID cancelled"));

    await expect(useVaultStore.getState().unlockBiometric()).rejects.toThrow();

    expect(useVaultStore.getState().isUnlocked).toBe(false);
  });

  it("re-throws the original error", async () => {
    const original = new Error("biometric unavailable");
    mockUnlockBiometric.mockRejectedValueOnce(original);

    await expect(useVaultStore.getState().unlockBiometric()).rejects.toBe(original);
  });
});

describe("enableBiometric()", () => {
  it("sets isBiometricEnabled=true on success", async () => {
    mockEnableBiometric.mockResolvedValueOnce(undefined);

    await useVaultStore.getState().enableBiometric();

    expect(useVaultStore.getState().isBiometricEnabled).toBe(true);
  });

  it("leaves isBiometricEnabled=false when command throws", async () => {
    mockEnableBiometric.mockRejectedValueOnce(new Error("vault is locked"));

    await expect(useVaultStore.getState().enableBiometric()).rejects.toThrow();

    expect(useVaultStore.getState().isBiometricEnabled).toBe(false);
  });
});

describe("disableBiometric()", () => {
  it("sets isBiometricEnabled=false", async () => {
    useVaultStore.setState({ isBiometricEnabled: true });
    mockDisableBiometric.mockResolvedValueOnce(undefined);

    await useVaultStore.getState().disableBiometric();

    expect(useVaultStore.getState().isBiometricEnabled).toBe(false);
  });
});

describe("disablePassword()", () => {
  it("clears both isPasswordRequired and isBiometricEnabled atomically", async () => {
    useVaultStore.setState({ isPasswordRequired: true, isBiometricEnabled: true });
    mockInvoke.mockResolvedValueOnce(undefined);

    await useVaultStore.getState().disablePassword("correct");

    const { isPasswordRequired, isBiometricEnabled } = useVaultStore.getState();
    expect(isPasswordRequired).toBe(false);
    expect(isBiometricEnabled).toBe(false);
  });

  it("sets isUnlocked=true after disabling", async () => {
    useVaultStore.setState({ isUnlocked: false });
    mockInvoke.mockResolvedValueOnce(undefined);

    await useVaultStore.getState().disablePassword("correct");

    expect(useVaultStore.getState().isUnlocked).toBe(true);
  });
});

describe("lock()", () => {
  it("sets isUnlocked=false regardless of prior state", async () => {
    useVaultStore.setState({ isUnlocked: true });
    mockInvoke.mockResolvedValueOnce(undefined);

    await useVaultStore.getState().lock();

    expect(useVaultStore.getState().isUnlocked).toBe(false);
  });
});

describe("setup()", () => {
  it("sets isSetup=true and isUnlocked=true", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await useVaultStore.getState().setup("newpassword");

    expect(useVaultStore.getState()).toMatchObject({ isSetup: true, isUnlocked: true });
  });
});

describe("skipSetup()", () => {
  it("sets isPasswordRequired=false", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await useVaultStore.getState().skipSetup();

    expect(useVaultStore.getState().isPasswordRequired).toBe(false);
  });
});
