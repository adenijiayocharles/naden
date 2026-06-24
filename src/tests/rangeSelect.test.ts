import { describe, it, expect } from "vitest";
import { arrowSelect } from "../lib/rangeSelect";

const paths = ["a", "b", "c", "d", "e"];

describe("arrowSelect — empty list", () => {
  it("returns null when paths is empty", () => {
    expect(arrowSelect([], null, null, 1)).toBeNull();
  });
});

describe("arrowSelect — fresh start (no anchor/cursor)", () => {
  it("selects the first path when anchorPath is null and direction is 1", () => {
    const result = arrowSelect(paths, null, null, 1);

    expect(result?.selected).toEqual(["a"]);
  });

  it("sets anchorPath to the first path when direction is 1", () => {
    const result = arrowSelect(paths, null, null, 1);

    expect(result?.anchorPath).toBe("a");
  });

  it("sets cursorIndex to 0 when direction is 1", () => {
    const result = arrowSelect(paths, null, null, 1);

    expect(result?.cursorIndex).toBe(0);
  });

  it("selects the last path when anchorPath is null and direction is -1", () => {
    const result = arrowSelect(paths, null, null, -1);

    expect(result?.selected).toEqual(["e"]);
  });

  it("sets cursorIndex to the last index when direction is -1", () => {
    const result = arrowSelect(paths, null, null, -1);

    expect(result?.cursorIndex).toBe(4);
  });

  it("treats a null cursorPath as a fresh start even when anchorPath is set", () => {
    const result = arrowSelect(paths, "b", null, 1);

    expect(result?.selected).toEqual(["a"]);
  });
});

describe("arrowSelect — extending a range away from the anchor", () => {
  it("extends the selection by one row toward the cursor direction", () => {
    const result = arrowSelect(paths, "b", "b", 1);

    expect(result?.selected).toEqual(["b", "c"]);
  });

  it("keeps the anchorPath unchanged while extending", () => {
    const result = arrowSelect(paths, "b", "b", 1);

    expect(result?.anchorPath).toBe("b");
  });

  it("moves cursorPath to the new extent when extending", () => {
    const result = arrowSelect(paths, "b", "b", 1);

    expect(result?.cursorPath).toBe("c");
  });

  it("extends further on repeated calls in the same direction", () => {
    const result = arrowSelect(paths, "b", "d", 1);

    expect(result?.selected).toEqual(["b", "c", "d", "e"]);
  });

  it("extends upward when direction is -1 and the anchor is below the cursor", () => {
    const result = arrowSelect(paths, "d", "c", -1);

    expect(result?.selected).toEqual(["b", "c", "d"]);
  });
});

describe("arrowSelect — shrinking a range back toward the anchor", () => {
  it("shrinks the selection by one row when moving back toward the anchor", () => {
    const result = arrowSelect(paths, "b", "d", -1);

    expect(result?.selected).toEqual(["b", "c"]);
  });

  it("shrinks to just the anchor when the cursor returns to it", () => {
    const result = arrowSelect(paths, "b", "c", -1);

    expect(result?.selected).toEqual(["b"]);
  });
});

describe("arrowSelect — crossing past the anchor reverses selection side", () => {
  it("starts selecting the opposite side once the cursor passes the anchor", () => {
    const result = arrowSelect(paths, "b", "b", -1);

    expect(result?.selected).toEqual(["a", "b"]);
  });

  it("moves cursorPath to the opposite side once it passes the anchor", () => {
    const result = arrowSelect(paths, "b", "b", -1);

    expect(result?.cursorPath).toBe("a");
  });
});

describe("arrowSelect — clamping at list boundaries", () => {
  it("clamps cursorIndex at 0 when already at the top and moving up", () => {
    const result = arrowSelect(paths, "a", "a", -1);

    expect(result?.cursorIndex).toBe(0);
  });

  it("keeps the selection a single row when clamped at the top", () => {
    const result = arrowSelect(paths, "a", "a", -1);

    expect(result?.selected).toEqual(["a"]);
  });

  it("clamps cursorIndex at the last index when already at the bottom and moving down", () => {
    const result = arrowSelect(paths, "e", "e", 1);

    expect(result?.cursorIndex).toBe(4);
  });

  it("keeps the selection a single row when clamped at the bottom", () => {
    const result = arrowSelect(paths, "e", "e", 1);

    expect(result?.selected).toEqual(["e"]);
  });
});

describe("arrowSelect — stale paths", () => {
  it("returns null when anchorPath is no longer in paths", () => {
    expect(arrowSelect(paths, "stale", "b", 1)).toBeNull();
  });

  it("returns null when cursorPath is no longer in paths", () => {
    expect(arrowSelect(paths, "b", "stale", 1)).toBeNull();
  });
});
