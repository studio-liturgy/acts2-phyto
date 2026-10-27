import { describe, expect, it } from "vitest";
import { LIVE_STALE_MS, liveIsStale } from "../live-stale";

describe("liveIsStale", () => {
  const now = 1_800_000_000_000;
  it("keeps a slide changed within 8 hours", () => {
    expect(liveIsStale(now - LIVE_STALE_MS + 1000, now)).toBe(false);
  });
  it("clears one left 8 hours or more", () => {
    expect(liveIsStale(now - LIVE_STALE_MS, now)).toBe(true);
    expect(liveIsStale(now - 3 * LIVE_STALE_MS, now)).toBe(true);
  });
  it("keeps state that has no recorded time (older builds)", () => {
    expect(liveIsStale(null, now)).toBe(false);
  });
});
