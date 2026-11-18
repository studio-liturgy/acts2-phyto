import { describe, expect, it } from "vitest";
import { pageAt, slideOffset, slides, swipeStep } from "../intro-carousel";

describe("intro carousel", () => {
  it("maps any position to a page, past either end", () => {
    expect(pageAt(0, 6)).toBe(0);
    expect(pageAt(5, 6)).toBe(5);
    expect(pageAt(6, 6)).toBe(0);
    expect(pageAt(-1, 6)).toBe(5);
  });

  it("keeps the neighbours of the current page at ±1, across the loop", () => {
    // On the last page: the first page waits on the right.
    expect(slideOffset(5, 5, 6)).toBe(0);
    expect(slideOffset(0, 5, 6)).toBe(1);
    expect(slideOffset(4, 5, 6)).toBe(-1);
    // On the first page (after the loop): the last page waits on the left.
    expect(slideOffset(5, 6, 6)).toBe(-1);
    expect(slideOffset(0, 6, 6)).toBe(0);
  });

  it("last page to first: the first page's own element slides in", () => {
    expect(slides(0, 5, 6, 6)).toBe(true); // first page: right to centre
    expect(slides(5, 5, 6, 6)).toBe(true); // last page: centre to left
    // Exactly one page wraps round the far side, off screen and unanimated.
    const wrapped = [0, 1, 2, 3, 4, 5].filter((i) => !slides(i, 5, 6, 6));
    expect(wrapped).toHaveLength(1);
    expect(Math.abs(slideOffset(wrapped[0], 5, 6))).toBeGreaterThan(1);
    expect(Math.abs(slideOffset(wrapped[0], 6, 6))).toBeGreaterThan(1);
  });

  it("first page back to last: the last page's own element slides in", () => {
    expect(slides(5, 0, -1, 6)).toBe(true);
    expect(slideOffset(5, -1, 6)).toBe(0);
    expect(slideOffset(0, -1, 6)).toBe(1);
  });

  it("moves on a long swipe or a quick flick, not a small drag", () => {
    expect(swipeStep(-100, 375, 400)).toBe(1);
    expect(swipeStep(100, 375, 400)).toBe(-1);
    expect(swipeStep(-30, 375, 400)).toBe(0);
    expect(swipeStep(-30, 375, 60)).toBe(1);
    expect(swipeStep(-8, 375, 5)).toBe(0);
  });
});
