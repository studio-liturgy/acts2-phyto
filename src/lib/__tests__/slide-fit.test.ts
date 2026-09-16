import { describe, it, expect } from "vitest";
import { fitScale, fitOrigin, FIT_MIN, STAGE_H, STAGE_W } from "../slide-fit";

describe("fitScale", () => {
  it("leaves content that already fits completely alone", () => {
    expect(fitScale(400, 920)).toBe(1);
    expect(fitScale(920, 920)).toBe(1);
  });

  it("scales overflowing content down by exactly the overflow ratio", () => {
    expect(fitScale(1840, 920)).toBe(0.5);
    expect(fitScale(1150, 920)).toBeCloseTo(0.8);
  });

  it("stops at the floor rather than shrinking to unreadable", () => {
    expect(fitScale(100_000, 920)).toBe(FIT_MIN);
  });

  it("honours a caller-supplied floor", () => {
    expect(fitScale(10_000, 920, 0.7)).toBe(0.7);
  });

  it("returns 1 for degenerate measurements instead of collapsing the slide", () => {
    // A hidden or not-yet-laid-out element measures 0. Scaling by 0/0 would
    // blank the slide; the safe answer is to render at full size.
    expect(fitScale(0, 920)).toBe(1);
    expect(fitScale(400, 0)).toBe(1);
    expect(fitScale(NaN, 920)).toBe(1);
    expect(fitScale(400, Infinity)).toBe(1);
  });
});

describe("fitOrigin", () => {
  it("shrinks top-positioned text towards the top edge it is aligned to", () => {
    expect(fitOrigin("top")).toBe("top center");
  });

  it("shrinks centred text towards the middle", () => {
    expect(fitOrigin("centre")).toBe("center center");
    expect(fitOrigin(undefined)).toBe("center center");
  });
});

describe("stage constants", () => {
  it("is 16:9, which the aspect-video containers assume", () => {
    expect(STAGE_W / STAGE_H).toBeCloseTo(16 / 9);
  });
});
