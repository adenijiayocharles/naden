import { describe, it, expect } from "vitest";
import { computeColumnCount, chunkIntoRows } from "../lib/gridColumns";

describe("computeColumnCount()", () => {
  it("fits multiple columns when the container is wide enough", () => {
    const result = computeColumnCount(1000, 240, 12);

    expect(result).toBe(4);
  });

  it("returns 1 column when the container is narrower than one item", () => {
    const result = computeColumnCount(200, 240, 12);

    expect(result).toBe(1);
  });

  it("returns 1 column for a zero or negative width (not yet measured)", () => {
    expect(computeColumnCount(0, 240, 12)).toBe(1);
    expect(computeColumnCount(-50, 240, 12)).toBe(1);
  });

  it("accounts for the gap between items when fitting columns", () => {
    // Exactly 2 items + 1 gap fit; a 3rd would need another gap that doesn't fit.
    const result = computeColumnCount(2 * 240 + 12, 240, 12);

    expect(result).toBe(2);
  });
});

describe("chunkIntoRows()", () => {
  it("splits items into fixed-size rows", () => {
    const result = chunkIntoRows([1, 2, 3, 4, 5], 2);

    expect(result).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("puts one item per row when columns is 1", () => {
    const result = chunkIntoRows([1, 2, 3], 1);

    expect(result).toEqual([[1], [2], [3]]);
  });

  it("returns an empty array for an empty input", () => {
    const result = chunkIntoRows([], 3);

    expect(result).toEqual([]);
  });
});
