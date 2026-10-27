import { describe, expect, it } from "vitest";
import { revealDelta } from "../phone-dock";

// An 844px screen, the editor starting 200px down, a 380px keyboard.
describe("revealDelta", () => {
  it("leaves a line alone when the keyboard won't cover it", () => {
    expect(revealDelta({ top: 300, bottom: 340 }, 200, 844, 380)).toBe(0);
  });

  it("brings a line the keyboard would cover to the editor's top", () => {
    // Visible down to 844 - 380 - 56 = 408; this line ends at 640.
    expect(revealDelta({ top: 600, bottom: 640 }, 200, 844, 380)).toBe(600 - 208);
  });

  it("with the keyboard already up, only the screen above it counts", () => {
    // Screen is the 464px above the keyboard; the dock sits at its foot.
    expect(revealDelta({ top: 380, bottom: 420 }, 200, 464, 0)).toBe(380 - 208);
    expect(revealDelta({ top: 300, bottom: 340 }, 200, 464, 0)).toBe(0);
  });
});
