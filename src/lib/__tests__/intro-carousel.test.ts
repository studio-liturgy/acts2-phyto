import { describe, expect, it } from "vitest";
import { loopJump, pageAt, swipeStep } from "../intro-carousel";

describe("intro carousel", () => {
  it("maps track positions to pages, copies included", () => {
    expect(pageAt(1, 6)).toBe(0);
    expect(pageAt(6, 6)).toBe(5);
    expect(pageAt(0, 6)).toBe(5); // copy of the last page
    expect(pageAt(7, 6)).toBe(0); // copy of the first page
  });

  it("jumps from a copy to the real page it copies", () => {
    expect(loopJump(0, 6)).toBe(6);
    expect(loopJump(7, 6)).toBe(1);
    expect(loopJump(3, 6)).toBeNull();
  });

  it("moves on a long swipe or a quick flick, not a small drag", () => {
    expect(swipeStep(-100, 375, 400)).toBe(1);
    expect(swipeStep(100, 375, 400)).toBe(-1);
    expect(swipeStep(-30, 375, 400)).toBe(0);
    expect(swipeStep(-30, 375, 60)).toBe(1);
    expect(swipeStep(-8, 375, 5)).toBe(0);
  });
});
