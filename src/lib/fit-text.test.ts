import { describe, expect, it } from "vitest";
import { fitFontSize } from "./fit-text";

describe("fitFontSize", () => {
  it("grows text to fill a wider space", () => {
    expect(fitFontSize(11, 250, 300)).toBe(13.2);
  });
  it("shrinks text that runs past the space", () => {
    expect(fitFontSize(11, 330, 300)).toBe(10);
  });
  it("never rounds up past the space", () => {
    const size = fitFontSize(11, 317, 296);
    expect((317 * size) / 11).toBeLessThanOrEqual(296);
  });
  it("holds between min and max", () => {
    expect(fitFontSize(11, 100, 400)).toBe(16);
    expect(fitFontSize(11, 600, 200, { min: 9 })).toBe(9);
  });
  it("keeps the size when nothing is measured yet", () => {
    expect(fitFontSize(11, 0, 300)).toBe(11);
    expect(fitFontSize(11, 300, 0)).toBe(11);
  });
});
