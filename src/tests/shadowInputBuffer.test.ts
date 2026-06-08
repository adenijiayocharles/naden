import { describe, it, expect, beforeEach } from "vitest";
import { shadowInputBuffer } from "../lib/shadowInputBuffer";

const SESSION = "test-session";

beforeEach(() => {
  shadowInputBuffer.attach(SESSION);
});

describe("shadowInputBuffer.feed", () => {
  it("accumulates printable characters into the line", () => {
    shadowInputBuffer.feed(SESSION, "g");
    shadowInputBuffer.feed(SESSION, "i");
    shadowInputBuffer.feed(SESSION, "t");
    expect(shadowInputBuffer.getLine(SESSION)).toBe("git");
  });

  it("removes the last character on backspace", () => {
    shadowInputBuffer.feed(SESSION, "git");
    shadowInputBuffer.feed(SESSION, "\x7f");
    expect(shadowInputBuffer.getLine(SESSION)).toBe("gi");
  });

  it("clears the line on Ctrl-U", () => {
    shadowInputBuffer.feed(SESSION, "git status");
    shadowInputBuffer.feed(SESSION, "\x15");
    expect(shadowInputBuffer.getLine(SESSION)).toBe("");
  });

  it("clears the line when an escape sequence arrives", () => {
    shadowInputBuffer.feed(SESSION, "git");
    shadowInputBuffer.feed(SESSION, "\x1b[D"); // left arrow
    expect(shadowInputBuffer.getLine(SESSION)).toBe("");
  });

  it("does not spell escape-sequence bytes into the line", () => {
    shadowInputBuffer.feed(SESSION, "\x1b[D");
    shadowInputBuffer.feed(SESSION, "x");
    expect(shadowInputBuffer.getLine(SESSION)).toBe("x");
  });

  it("returns the trimmed command when Enter completes a non-empty line", () => {
    const completed = shadowInputBuffer.feed(SESSION, "git status\r");
    expect(completed).toBe("git status");
  });

  it("returns null when Enter completes an empty line", () => {
    const completed = shadowInputBuffer.feed(SESSION, "\r");
    expect(completed).toBeNull();
  });

  it("resets the line to empty after Enter completes a command", () => {
    shadowInputBuffer.feed(SESSION, "git status\r");
    expect(shadowInputBuffer.getLine(SESSION)).toBe("");
  });

  it("notifies subscribers once per feed with the resulting line", () => {
    const seen: string[] = [];
    const unsubscribe = shadowInputBuffer.subscribe(SESSION, (line) => seen.push(line));
    shadowInputBuffer.feed(SESSION, "l");
    shadowInputBuffer.feed(SESSION, "s");
    unsubscribe();
    expect(seen).toEqual(["l", "ls"]);
  });
});
