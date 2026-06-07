import { describe, it, expect } from "vitest";
import { isDestructiveCommand } from "../lib/destructiveCommands";

describe("isDestructiveCommand", () => {
  it("flags rm -rf", () => {
    expect(isDestructiveCommand("rm -rf /var/www")).toBe(true);
  });

  it("flags shutdown", () => {
    expect(isDestructiveCommand("sudo shutdown -h now")).toBe(true);
  });

  it("flags reboot", () => {
    expect(isDestructiveCommand("sudo reboot")).toBe(true);
  });

  it("flags dd with an if= argument", () => {
    expect(isDestructiveCommand("dd if=/dev/zero of=/dev/sda")).toBe(true);
  });

  it("flags mkfs", () => {
    expect(isDestructiveCommand("mkfs.ext4 /dev/sdb1")).toBe(true);
  });

  it("does not flag an ordinary command", () => {
    expect(isDestructiveCommand("git pull && make build")).toBe(false);
  });
});
