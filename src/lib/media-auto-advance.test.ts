import { describe, expect, it } from "vitest";
import { autoAdvanceStep } from "./media-auto-advance";
import type { Set as PhytoSet, Slide } from "./types";

const slide = (id: string, kind = "image", extra: Partial<Slide> = {}) =>
  ({ id, kind, lines: [], ...extra }) as unknown as Slide;
const media = (slides: Slide[], extra: Partial<PhytoSet> = {}) =>
  ({ id: "m", kind: "media", slides, autoAdvanceMs: 5000, ...extra }) as unknown as PhytoSet;

describe("autoAdvanceStep", () => {
  const set = media([slide("a"), slide("b"), slide("v", "video")]);

  it("moves to the next slide after the delay", () => {
    expect(autoAdvanceStep(set, "a", {})).toEqual({ ms: 5000, nextSlideId: "b" });
  });
  it("does nothing when off, stopped or outside a media set", () => {
    expect(autoAdvanceStep(media(set.slides, { autoAdvanceMs: 0 }), "a", {})).toBeNull();
    expect(autoAdvanceStep(set, "a", { blackout: true })).toBeNull();
    expect(autoAdvanceStep({ ...set, kind: "song" } as PhytoSet, "a", {})).toBeNull();
  });
  it("waits for a video to end", () => {
    const vs = media([slide("v", "video"), slide("b")]);
    expect(autoAdvanceStep(vs, "v", {})).toBeNull();
    expect(autoAdvanceStep(vs, "v", { videoEnded: true })).toEqual({ ms: 5000, nextSlideId: "b" });
  });
  it("stops at the end unless the set loops", () => {
    expect(autoAdvanceStep(set, "v", { videoEnded: true })).toBeNull();
    expect(autoAdvanceStep(media(set.slides, { loop: true }), "v", { videoEnded: true })).toEqual({
      ms: 5000,
      nextSlideId: "a",
    });
  });
  it("loops within a section", () => {
    const s = media([slide("a"), slide("b", "image", { sectionAfter: "x" }), slide("c")], {
      loop: true,
      loopSection: true,
    });
    expect(autoAdvanceStep(s, "b", {})?.nextSlideId).toBe("a");
    expect(autoAdvanceStep(s, "c", {})?.nextSlideId).toBe("c");
  });
});
