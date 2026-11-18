import { describe, expect, it } from "vitest";
import {
  LAUNCH_PLAYED_KEY,
  blocksAcross,
  blocksDown,
  coverCrop,
  grainAt,
  shouldPlayLaunch,
} from "../launch-reveal";

describe("launch reveal timeline", () => {
  it("halves the blocks in steps and holds at 48 across", () => {
    expect([0, 199, 200, 499, 500, 899, 900, 1400, 2200].map(blocksAcross)).toEqual([
      6, 6, 12, 12, 24, 24, 48, 48, 48,
    ]);
  });

  it("raises the grain smoothly from none to full, then holds", () => {
    expect(grainAt(0)).toBe(0);
    expect(grainAt(700)).toBeCloseTo(0.5);
    expect(grainAt(1400)).toBe(1);
    expect(grainAt(2000)).toBe(1);
    expect(grainAt(300)).toBeLessThan(grainAt(301));
  });

  it("keeps blocks square on a portrait phone", () => {
    expect(blocksDown(6, 390, 844)).toBe(13);
    expect(blocksDown(48, 390, 844)).toBe(104);
  });
});

describe("coverCrop", () => {
  it("crops the sides of a picture taller than wide for a portrait phone like CSS cover", () => {
    const c = coverCrop(800, 948, 390, 844);
    expect(c.sh).toBeCloseTo(948);
    expect(c.sw).toBeCloseTo((390 * 948) / 844);
    expect(c.sx).toBeCloseTo((800 - c.sw) / 2);
    expect(c.sy).toBeCloseTo(0);
  });

  it("crops top and bottom on a wide screen", () => {
    const c = coverCrop(800, 948, 1366, 1024);
    expect(c.sw).toBeCloseTo(800);
    expect(c.sy).toBeGreaterThan(0);
  });
});

describe("shouldPlayLaunch", () => {
  const store = (v: string | null) => ({
    getItem: (k: string) => (k === LAUNCH_PLAYED_KEY ? v : null),
  });
  it("plays once per launch, only in the app", () => {
    expect(shouldPlayLaunch(true, store(null))).toBe(true);
    expect(shouldPlayLaunch(true, store("1"))).toBe(false);
    expect(shouldPlayLaunch(false, store(null))).toBe(false);
    expect(shouldPlayLaunch(true, null)).toBe(true);
  });
});
