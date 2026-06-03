import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// Import after fake timers are installed so module-level Date.now() uses
// the controlled clock. Re-import on every test file run via resetModules.
async function load() {
  const mod = await import("../lib/vaultActivity");
  return mod;
}

describe("getLastHeartbeatMs", () => {
  it("returns a number as its initial value", async () => {
    const { getLastHeartbeatMs } = await load();
    expect(typeof getLastHeartbeatMs()).toBe("number");
  });

  it("returns a value that is not NaN", async () => {
    const { getLastHeartbeatMs } = await load();
    expect(Number.isNaN(getLastHeartbeatMs())).toBe(false);
  });
});

describe("recordHeartbeat", () => {
  it("updates the stored value to the current Date.now()", async () => {
    vi.setSystemTime(1_000_000);
    const { recordHeartbeat, getLastHeartbeatMs } = await load();

    vi.setSystemTime(2_000_000);
    recordHeartbeat();

    expect(getLastHeartbeatMs()).toBe(2_000_000);
  });

  it("updates the value on a second call", async () => {
    vi.setSystemTime(1_000_000);
    const { recordHeartbeat, getLastHeartbeatMs } = await load();

    vi.setSystemTime(3_000_000);
    recordHeartbeat();

    vi.setSystemTime(5_000_000);
    recordHeartbeat();

    expect(getLastHeartbeatMs()).toBe(5_000_000);
  });
});
