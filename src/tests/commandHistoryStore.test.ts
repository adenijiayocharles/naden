import { describe, it, expect, beforeEach } from "vitest";
import { useCommandHistoryStore } from "../store/commandHistoryStore";

const SERVER = "server-1";

beforeEach(() => {
  useCommandHistoryStore.setState({ recent: new Map() });
});

describe("commandHistoryStore.suggest", () => {
  it("returns the most recently recorded command matching the prefix", () => {
    const { recordCommand, suggest } = useCommandHistoryStore.getState();
    recordCommand(SERVER, "git status");
    recordCommand(SERVER, "git log --oneline");
    expect(suggest(SERVER, "git ")).toBe("git log --oneline");
  });

  it("returns null when no recorded command matches the prefix", () => {
    const { recordCommand, suggest } = useCommandHistoryStore.getState();
    recordCommand(SERVER, "ls -la");
    expect(suggest(SERVER, "git")).toBeNull();
  });

  it("does not suggest a command that exactly equals the typed prefix", () => {
    const { recordCommand, suggest } = useCommandHistoryStore.getState();
    recordCommand(SERVER, "ls");
    expect(suggest(SERVER, "ls")).toBeNull();
  });

  it("moves a re-typed command back to the front, deduped", () => {
    const { recordCommand, suggest } = useCommandHistoryStore.getState();
    recordCommand(SERVER, "git status");
    recordCommand(SERVER, "git log");
    recordCommand(SERVER, "git status");
    expect(suggest(SERVER, "git ")).toBe("git status");
  });

  it("keeps history scoped to its own server", () => {
    const { recordCommand, suggest } = useCommandHistoryStore.getState();
    recordCommand("server-2", "docker compose up");
    expect(suggest(SERVER, "docker")).toBeNull();
  });
});
