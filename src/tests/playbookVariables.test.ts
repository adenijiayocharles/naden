import { describe, it, expect } from "vitest";
import { resolvePlaybookStep } from "../lib/playbookVariables";
import type { Server } from "../types/server";

const server: Server = {
  id: "srv-1",
  displayName: "prod-web-1",
  hostname: "10.0.0.5",
  port: 2222,
  username: "deploy",
  authMethod: "key",
  isJumpHost: false,
  isFavourite: false,
  tags: [],
  createdAt: "",
  updatedAt: "",
};

describe("resolvePlaybookStep", () => {
  it("replaces {{host}} with the server hostname", () => {
    expect(resolvePlaybookStep("ping {{host}}", server)).toBe("ping 10.0.0.5");
  });

  it("replaces {{username}} with the server username", () => {
    expect(resolvePlaybookStep("whoami # {{username}}", server)).toBe("whoami # deploy");
  });

  it("replaces {{port}} with the server port as a string", () => {
    expect(resolvePlaybookStep("nc -z {{host}} {{port}}", server)).toBe("nc -z 10.0.0.5 2222");
  });

  it("replaces {{displayName}} with the server display name", () => {
    expect(resolvePlaybookStep("echo {{displayName}}", server)).toBe("echo prod-web-1");
  });

  it("leaves unknown placeholders untouched", () => {
    expect(resolvePlaybookStep("echo {{nope}}", server)).toBe("echo {{nope}}");
  });

  it("resolves multiple placeholders in the same string", () => {
    expect(resolvePlaybookStep("ssh {{username}}@{{host}} -p {{port}}", server)).toBe(
      "ssh deploy@10.0.0.5 -p 2222",
    );
  });
});
