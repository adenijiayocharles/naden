import { describe, it, expect } from "vitest";
import { validatePortForwardDraft, upsertDraft, removeDraft } from "../components/servers/portForwardDraft";
import type { DraftPortForward } from "../components/servers/serverFormTypes";

function makeDraft(overrides?: Partial<DraftPortForward>): DraftPortForward {
  return {
    id: "draft-1",
    label: "",
    forwardType: "local",
    localPort: 5432,
    remoteHost: "db.internal",
    remotePort: 5432,
    autoStart: false,
    ...overrides,
  };
}

describe("validatePortForwardDraft", () => {
  it("accepts a valid local forward", () => {
    expect(validatePortForwardDraft({ forwardType: "local", localPort: "5432", remoteHost: "db.internal", remotePort: "5432" })).toBeNull();
  });

  it("accepts a valid dynamic forward without a remote host or port", () => {
    expect(validatePortForwardDraft({ forwardType: "dynamic", localPort: "1080", remoteHost: "", remotePort: "" })).toBeNull();
  });

  it("rejects an empty local port", () => {
    expect(validatePortForwardDraft({ forwardType: "local", localPort: "", remoteHost: "db.internal", remotePort: "5432" })).toBe("Local port must be 1–65535");
  });

  it("rejects a local port of 0", () => {
    expect(validatePortForwardDraft({ forwardType: "local", localPort: "0", remoteHost: "db.internal", remotePort: "5432" })).toBe("Local port must be 1–65535");
  });

  it("rejects a local port above 65535", () => {
    expect(validatePortForwardDraft({ forwardType: "local", localPort: "65536", remoteHost: "db.internal", remotePort: "5432" })).toBe("Local port must be 1–65535");
  });

  it("rejects a non-numeric local port", () => {
    expect(validatePortForwardDraft({ forwardType: "local", localPort: "abc", remoteHost: "db.internal", remotePort: "5432" })).toBe("Local port must be 1–65535");
  });

  it("accepts the boundary local port 65535", () => {
    expect(validatePortForwardDraft({ forwardType: "local", localPort: "65535", remoteHost: "db.internal", remotePort: "5432" })).toBeNull();
  });

  it("rejects a missing remote host for a local forward", () => {
    expect(validatePortForwardDraft({ forwardType: "local", localPort: "5432", remoteHost: "", remotePort: "5432" })).toBe("Remote host is required");
  });

  it("rejects a whitespace-only remote host", () => {
    expect(validatePortForwardDraft({ forwardType: "local", localPort: "5432", remoteHost: "   ", remotePort: "5432" })).toBe("Remote host is required");
  });

  it("rejects a missing remote port for a remote forward", () => {
    expect(validatePortForwardDraft({ forwardType: "remote", localPort: "5432", remoteHost: "db.internal", remotePort: "" })).toBe("Remote port must be 1–65535");
  });

  it("rejects a remote port above 65535", () => {
    expect(validatePortForwardDraft({ forwardType: "remote", localPort: "5432", remoteHost: "db.internal", remotePort: "70000" })).toBe("Remote port must be 1–65535");
  });

  it("does not require a remote host for a dynamic forward even when blank", () => {
    expect(validatePortForwardDraft({ forwardType: "dynamic", localPort: "1080", remoteHost: "", remotePort: "" })).toBeNull();
  });
});

describe("upsertDraft", () => {
  const payload = {
    label: "Postgres",
    forwardType: "local" as const,
    localPort: 5432,
    remoteHost: "db.internal",
    remotePort: 5432,
    autoStart: false,
  };

  it("appends a new draft with a generated id when not editing", () => {
    const next = upsertDraft([], null, payload, () => "generated-id");
    expect(next).toEqual([{ ...payload, id: "generated-id" }]);
  });

  it("keeps existing drafts when appending a new one", () => {
    const existing = makeDraft({ id: "draft-1" });
    const next = upsertDraft([existing], null, payload, () => "draft-2");
    expect(next[0]).toBe(existing);
  });

  it("replaces the matching draft in place when editing", () => {
    const existing = makeDraft({ id: "draft-1", label: "Old label" });
    const next = upsertDraft([existing], "draft-1", payload);
    expect(next).toEqual([{ ...payload, id: "draft-1" }]);
  });

  it("preserves the original position of the edited draft", () => {
    const first = makeDraft({ id: "draft-1" });
    const second = makeDraft({ id: "draft-2", label: "Second" });
    const next = upsertDraft([first, second], "draft-2", payload);
    expect(next[1].id).toBe("draft-2");
  });

  it("leaves other drafts untouched when editing one", () => {
    const first = makeDraft({ id: "draft-1" });
    const second = makeDraft({ id: "draft-2" });
    const next = upsertDraft([first, second], "draft-2", payload);
    expect(next[0]).toBe(first);
  });
});

describe("removeDraft", () => {
  it("removes the draft with the matching id", () => {
    const drafts = [makeDraft({ id: "draft-1" }), makeDraft({ id: "draft-2" })];
    expect(removeDraft(drafts, "draft-1")).toEqual([drafts[1]]);
  });

  it("returns an equivalent array when the id is not found", () => {
    const drafts = [makeDraft({ id: "draft-1" })];
    expect(removeDraft(drafts, "missing")).toEqual(drafts);
  });

  it("returns an empty array when removing the only draft", () => {
    expect(removeDraft([makeDraft({ id: "draft-1" })], "draft-1")).toEqual([]);
  });
});
