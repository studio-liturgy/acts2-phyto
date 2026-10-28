import { describe, expect, it } from "vitest";
import { rangeGesture, rangeValueAt } from "@/lib/range-tap";

// A 212px slider at x=100: the thumb centre runs from 106 to 306.
const at = (x: number) => rangeValueAt(x, 100, 212, 1, 2, 0.05);

describe("rangeValueAt", () => {
  it("maps a tap to where the thumb centre would sit", () => {
    expect(at(106)).toBe(1);
    expect(at(206)).toBe(1.5);
    expect(at(306)).toBe(2);
  });

  it("clamps taps past either end", () => {
    expect(at(0)).toBe(1);
    expect(at(999)).toBe(2);
  });

  it("snaps to the step without float drift", () => {
    expect(at(150)).toBe(1.2);
    expect(rangeValueAt(150, 100, 212, 0.85, 1.8, 0.05)).toBe(1.05);
    expect(rangeValueAt(206, 100, 212, 0, 90, 5)).toBe(45);
  });
});

describe("rangeGesture", () => {
  it("is a tap until the finger moves", () => {
    expect(rangeGesture(10, 10, 13, 12)).toBe("pending");
  });

  it("sideways drags, up/down scrolls the page", () => {
    expect(rangeGesture(10, 10, 30, 14)).toBe("drag");
    expect(rangeGesture(10, 10, 14, 40)).toBe("scroll");
  });
});
