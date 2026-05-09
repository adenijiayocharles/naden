import { describe, it, expect } from "vitest";
import { formatError, isAppError, type AppError } from "../lib/errors";

describe("isAppError", () => {
  it("returns true for a well-formed AppError", () => {
    const e: AppError = { kind: "Vault", message: "locked" };
    expect(isAppError(e)).toBe(true);
  });

  it("returns false for a plain Error", () => {
    expect(isAppError(new Error("oops"))).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isAppError("bad")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isAppError(null)).toBe(false);
  });

  it("returns false for an object missing kind", () => {
    expect(isAppError({ message: "x" })).toBe(false);
  });

  it("returns false for an object missing message", () => {
    expect(isAppError({ kind: "Ssh" })).toBe(false);
  });
});

describe("formatError", () => {
  it("extracts message from AppError", () => {
    const e: AppError = { kind: "Ssh", message: "TCP connect failed" };
    expect(formatError(e)).toBe("TCP connect failed");
  });

  it("extracts message from a plain Error", () => {
    expect(formatError(new Error("something broke"))).toBe("something broke");
  });

  it("stringifies an unknown value", () => {
    expect(formatError(42)).toBe("42");
  });

  it("stringifies undefined", () => {
    expect(formatError(undefined)).toBe("undefined");
  });

  it("returns the message from a Validation AppError", () => {
    const e: AppError = { kind: "Validation", message: "port must be between 1 and 65535" };
    expect(formatError(e)).toBe("port must be between 1 and 65535");
  });
});
