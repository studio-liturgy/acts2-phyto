import { describe, expect, it } from "vitest";
import { balanceRows } from "../balance-rows";

describe("balanceRows (section pills on the remote)", () => {
  it("one row when they all fit", () => {
    expect(balanceRows([50, 50, 50], 6, 400)).toEqual([3]);
    expect(balanceRows([], 6, 400)).toEqual([]);
  });

  it("five pills that wrap 4 / 1 read 3 / 2", () => {
    // 4 fit in 230 (4 * 50 + 3 * 6 = 218); greedy would leave one alone.
    expect(balanceRows([50, 50, 50, 50, 50], 6, 230)).toEqual([3, 2]);
  });

  it("evens out uneven widths without breaking the row limit", () => {
    const rows = balanceRows([90, 40, 40, 40, 90, 40], 6, 230);
    expect(rows.reduce((a, b) => a + b, 0)).toBe(6);
    expect(rows.length).toBe(2);
    expect(rows).not.toContain(1);
  });

  it("keeps the fewest rows", () => {
    expect(balanceRows([50, 50, 50, 50, 50, 50, 50], 6, 120)).toHaveLength(4);
  });

  it("a pill wider than the row still gets its own row", () => {
    expect(balanceRows([300, 50], 6, 200)).toEqual([1, 1]);
  });
});
