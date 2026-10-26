import { describe, expect, it } from "vitest";
import { moveItem, parsePhoneTab, reorderTarget } from "../phone-layout";

describe("reorderTarget", () => {
  // Four rows 40px tall: centres at 20, 60, 100, 140.
  const mids = [20, 60, 100, 140];

  it("stays put until the finger passes a neighbour's centre", () => {
    expect(reorderTarget(mids, 1, 50)).toBe(1);
    expect(reorderTarget(mids, 1, 70)).toBe(1);
  });

  it("moves down past each centre crossed", () => {
    expect(reorderTarget(mids, 0, 105)).toBe(2);
    expect(reorderTarget(mids, 0, 400)).toBe(3);
  });

  it("moves up past each centre crossed", () => {
    expect(reorderTarget(mids, 3, 55)).toBe(1);
    expect(reorderTarget(mids, 3, -10)).toBe(0);
  });

  it("replays a drag from first to last and back", () => {
    let order = ["a", "b", "c", "d"];
    let from = 0;
    for (const y of [30, 70, 110, 150]) {
      const to = reorderTarget(mids, from, y);
      order = moveItem(order, from, to);
      from = to;
    }
    expect(order).toEqual(["b", "c", "d", "a"]);
    for (const y of [130, 90, 50, 10]) {
      const to = reorderTarget(mids, from, y);
      order = moveItem(order, from, to);
      from = to;
    }
    expect(order).toEqual(["a", "b", "c", "d"]);
  });
});

describe("moveItem", () => {
  it("keeps duplicates apart by position", () => {
    expect(moveItem(["x", "y", "x"], 2, 0)).toEqual(["x", "x", "y"]);
  });
  it("returns the same list for a no-op", () => {
    const list = [1, 2];
    expect(moveItem(list, 1, 1)).toBe(list);
  });
});

describe("parsePhoneTab", () => {
  it("accepts the three tabs only", () => {
    expect(parsePhoneTab("catalogue")).toBe("catalogue");
    expect(parsePhoneTab("present")).toBeUndefined();
  });
});
