import { describe, expect, it } from "vitest";
import { revealDelta } from "../phone-dock";

// An 844px screen, the editor starting 200px down, a 380px keyboard: lines
// are visible down to 844 - 380 - 56 (tools tab) - 12 (gap) = 396.
describe("revealDelta", () => {
  it("leaves a line alone when the keyboard won't cover it", () => {
    expect(revealDelta({ top: 300, bottom: 340 }, 200, 844, 380)).toBe(0);
  });

  it("moves a covered line only far enough to sit just above the keyboard", () => {
    // Ends at 640: up by 640 - 396, not all the way to the editor's top.
    expect(revealDelta({ top: 600, bottom: 640 }, 200, 844, 380)).toBe(244);
  });

  it("never takes a line past the editor's top", () => {
    // A 300px-tall line can't fit; it stops 8px under the editor's top.
    expect(revealDelta({ top: 500, bottom: 800 }, 200, 844, 380)).toBe(500 - 208);
  });

  it("with the keyboard already up, only the screen above it counts", () => {
    // Screen is the 464px above the keyboard: visible down to 396.
    expect(revealDelta({ top: 380, bottom: 420 }, 200, 464, 0)).toBe(24);
    expect(revealDelta({ top: 300, bottom: 340 }, 200, 464, 0)).toBe(0);
  });
});
