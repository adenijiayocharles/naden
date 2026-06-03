import { describe, it, expect } from "vitest";
import { passwordStrength } from "../lib/passwordStrength";

describe("passwordStrength", () => {
  it("returns empty label and 0% for an empty string", () => {
    expect(passwordStrength("")).toEqual({ label: "", color: "bg-surface-4", pct: "0%" });
  });

  it("returns Too short for a single character", () => {
    expect(passwordStrength("a").label).toBe("Too short");
  });

  it("returns 25% for a single character", () => {
    expect(passwordStrength("a").pct).toBe("25%");
  });

  it("returns Too short at the boundary of length 7", () => {
    expect(passwordStrength("abcdefg").label).toBe("Too short");
  });

  it("returns Weak for an 8-character lowercase-only password", () => {
    expect(passwordStrength("abcdefgh").label).toBe("Weak");
  });

  it("returns Weak for an 8-character mixed-case+digit password (not long enough for Moderate)", () => {
    expect(passwordStrength("Abcdef1!").label).toBe("Weak");
  });

  it("returns Moderate for a 12-character password with two character classes", () => {
    expect(passwordStrength("abcdefghijAB").label).toBe("Moderate");
  });

  it("returns Weak for a 12-character password with only one character class", () => {
    expect(passwordStrength("abcdefghijkl").label).toBe("Weak");
  });

  it("returns Strong for a 16-character password with three character classes", () => {
    expect(passwordStrength("Abcdefghijklmn1!").label).toBe("Strong");
  });

  it("returns Moderate for a 16-character password with only two character classes", () => {
    expect(passwordStrength("abcdefghijklmnAB").label).toBe("Moderate");
  });

  it("returns Moderate for exactly 15 characters with three character classes (just under Strong length)", () => {
    expect(passwordStrength("Abcdefghijklm1!").label).toBe("Moderate");
  });

  it("returns Weak for a long all-lowercase passphrase", () => {
    expect(passwordStrength("correcthorsebattery").label).toBe("Weak");
  });

  it("returns Moderate for a 12-character mixed-case+digit password", () => {
    expect(passwordStrength("Password1234").label).toBe("Moderate");
  });

  it("returns Strong for a password with upper, lower, digit, and symbol at 16+ chars", () => {
    expect(passwordStrength("P@ssw0rd!SecureX").label).toBe("Strong");
  });

  it("returns the bg-accent color for a Strong password", () => {
    expect(passwordStrength("P@ssw0rd!SecureX").color).toBe("bg-accent");
  });

  it("returns 100% for a Strong password", () => {
    expect(passwordStrength("P@ssw0rd!SecureX").pct).toBe("100%");
  });

  it("returns bg-yellow-400 color for a Moderate password", () => {
    expect(passwordStrength("Password1234").color).toBe("bg-yellow-400");
  });

  it("returns bg-orange-500 color for a Weak password", () => {
    expect(passwordStrength("abcdefgh").color).toBe("bg-orange-500");
  });
});
