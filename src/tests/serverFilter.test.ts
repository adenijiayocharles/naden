import { describe, it, expect } from "vitest";
import { applyActiveFilter } from "../lib/serverFilter";
import type { Server, Tag } from "../types/server";

function makeServer(overrides: Partial<Server> & { id: string }): Server {
  return {
    displayName: overrides.id,
    hostname: `${overrides.id}.example.com`,
    port: 22,
    username: "ubuntu",
    authMethod: "key",
    isJumpHost: false,
    isFavourite: false,
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as Server;
}

const prodTag: Tag = { id: "tag-prod", name: "prod" };
const devTag: Tag = { id: "tag-dev", name: "dev" };

const alpha = makeServer({ id: "alpha", groupId: "group-1", tags: [prodTag], isFavourite: true });
const beta = makeServer({ id: "beta", groupId: "group-2", tags: [devTag], isFavourite: false });
const gamma = makeServer({ id: "gamma", groupId: "group-1", tags: [devTag], isFavourite: false });

describe("applyActiveFilter()", () => {
  it("returns the full list when no filter is active", () => {
    const result = applyActiveFilter([alpha, beta, gamma], false, null, null);

    expect(result).toEqual([alpha, beta, gamma]);
  });

  it("keeps only favourites when the favourites filter is active", () => {
    const result = applyActiveFilter([alpha, beta, gamma], true, null, null);

    expect(result).toEqual([alpha]);
  });

  it("keeps only servers in the active group when a group filter is set", () => {
    const result = applyActiveFilter([alpha, beta, gamma], false, "group-1", null);

    expect(result).toEqual([alpha, gamma]);
  });

  it("keeps only servers with the active tag when a tag filter is set", () => {
    const result = applyActiveFilter([alpha, beta, gamma], false, null, "tag-dev");

    expect(result).toEqual([beta, gamma]);
  });

  it("excludes servers that match the search but not the active group filter", () => {
    // Simulates a backend fuzzy_search result that spans multiple groups;
    // the UI should narrow it down to the group currently selected in the sidebar.
    const searchResults = [alpha, beta];

    const result = applyActiveFilter(searchResults, false, "group-1", null);

    expect(result).toEqual([alpha]);
  });

  it("prioritizes the favourites filter over a simultaneously-set group filter", () => {
    const result = applyActiveFilter([alpha, beta, gamma], true, "group-2", null);

    expect(result).toEqual([alpha]);
  });

  it("returns an empty array when nothing matches the active tag filter", () => {
    const result = applyActiveFilter([alpha], false, null, "tag-dev");

    expect(result).toEqual([]);
  });
});
