import { describe, it, expect } from "vitest";
import { formatHost, formatSize, formatDate } from "../lib/format";

describe("formatHost", () => {
  it("combines username, hostname, and non-22 port", () => {
    expect(formatHost({ username: "ubuntu", hostname: "10.0.0.1", port: 2222 }))
      .toBe("ubuntu@10.0.0.1:2222");
  });

  it("omits port when it is 22", () => {
    expect(formatHost({ username: "root", hostname: "prod.example.com", port: 22 }))
      .toBe("root@prod.example.com");
  });

  it("omits username when empty", () => {
    expect(formatHost({ username: "", hostname: "192.168.1.1", port: 22 }))
      .toBe("192.168.1.1");
  });

  it("includes both username omission and non-22 port", () => {
    expect(formatHost({ username: "", hostname: "bastion", port: 2222 }))
      .toBe("bastion:2222");
  });
});

describe("formatSize", () => {
  it("returns — for directories", () => {
    expect(formatSize(1024, true)).toBe("—");
  });

  it("formats bytes", () => {
    expect(formatSize(500, false)).toBe("500 B");
  });

  it("formats kilobytes with one decimal", () => {
    expect(formatSize(1536, false)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatSize(2 * 1024 * 1024, false)).toBe("2.0 MB");
  });

  it("formats gigabytes", () => {
    expect(formatSize(1.5 * 1024 * 1024 * 1024, false)).toBe("1.5 GB");
  });

  it("formats 0 bytes", () => {
    expect(formatSize(0, false)).toBe("0 B");
  });
});

describe("formatDate", () => {
  it("returns — for null", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("converts a Unix timestamp to a readable date string", () => {
    // 2024-01-15 00:00:00 UTC
    const ts = 1705276800;
    const result = formatDate(ts);
    expect(result).toMatch(/2024/);
    expect(result).toMatch(/Jan/);
  });

  it("returns — for 0 (treated as null-equivalent by callers, but 0 is a valid epoch)", () => {
    // formatDate(0) should return a date string for epoch, not "—"
    const result = formatDate(0);
    expect(result).not.toBe("—");
  });
});
