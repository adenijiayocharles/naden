import { describe, it, expect } from "vitest";
import { joinPath, parentPath } from "../lib/path";

describe("joinPath", () => {
  it("joins two plain segments with a slash", () => {
    expect(joinPath("a", "b")).toBe("a/b");
  });

  it("joins three segments", () => {
    expect(joinPath("a", "b", "c")).toBe("a/b/c");
  });

  it("collapses double slash when first segment has trailing slash and second has leading slash", () => {
    expect(joinPath("a/", "/b")).toBe("a/b");
  });

  it("preserves an absolute path prefix", () => {
    expect(joinPath("/home", "user", "file.txt")).toBe("/home/user/file.txt");
  });

  it("returns a single segment unchanged", () => {
    expect(joinPath("solo")).toBe("solo");
  });

  it("preserves a leading slash in the first segment", () => {
    expect(joinPath("/etc", "ssh")).toBe("/etc/ssh");
  });
});

describe("parentPath", () => {
  it("returns the directory for a file in a directory", () => {
    expect(parentPath("/home/user/file.txt")).toBe("/home/user");
  });

  it("strips trailing slash before finding the parent", () => {
    expect(parentPath("/home/user/")).toBe("/home");
  });

  it("returns / for the root path", () => {
    expect(parentPath("/")).toBe("/");
  });

  it("returns / for a file directly under root", () => {
    expect(parentPath("/file.txt")).toBe("/");
  });

  it("returns one level up for a deep path", () => {
    expect(parentPath("/a/b/c/d")).toBe("/a/b/c");
  });

  it("returns / when the path has no parent component", () => {
    expect(parentPath("/file")).toBe("/");
  });
});
