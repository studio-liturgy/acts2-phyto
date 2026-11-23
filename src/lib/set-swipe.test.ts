import { describe, expect, it } from "vitest";
import { moveSwipe, startSwipe, swipeStep } from "./set-swipe";

// Replays a touch from start to end through every move point, as the
// viewer's touch handlers do.
function replay(points: [number, number][]): -1 | 0 | 1 {
  const [first, ...rest] = points;
  let t = startSwipe(first[0], first[1]);
  for (const [x, y] of rest) t = moveSwipe(t, x, y);
  const [ex, ey] = points[points.length - 1];
  return swipeStep(t, ex, ey);
}

describe("swipeStep", () => {
  it("goes to the next set on a flat swipe left", () => {
    expect(
      replay([
        [300, 400],
        [250, 402],
        [180, 405],
      ]),
    ).toBe(1);
  });

  it("goes to the previous set on a flat swipe right", () => {
    expect(
      replay([
        [80, 400],
        [140, 398],
        [220, 396],
      ]),
    ).toBe(-1);
  });

  it("ignores a short sideways move", () => {
    expect(
      replay([
        [200, 400],
        [170, 400],
      ]),
    ).toBe(0);
  });

  it("stays on the set when scrolling the words with a thumb drifting right", () => {
    expect(
      replay([
        [150, 600],
        [170, 500],
        [195, 380],
        [215, 260],
      ]),
    ).toBe(0);
  });

  it("stays on the set when scrolling down with a drift left", () => {
    expect(
      replay([
        [250, 200],
        [230, 320],
        [200, 450],
        [180, 560],
      ]),
    ).toBe(0);
  });

  it("stays on the set for an angled swipe, even a shallow one", () => {
    expect(
      replay([
        [300, 400],
        [240, 370],
        [200, 345],
      ]),
    ).toBe(0);
  });

  it("stays on the set when a scroll goes up and comes back level", () => {
    expect(
      replay([
        [150, 400],
        [170, 250],
        [190, 150],
        [210, 300],
        [220, 400],
      ]),
    ).toBe(0);
  });
});
