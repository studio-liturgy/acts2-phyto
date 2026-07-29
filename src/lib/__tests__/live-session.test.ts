import { describe, it, expect } from "vitest";
import { LIVE_SESSION_MS, isLiveNow, liveExpiresAt, liveMsRemaining } from "../live-session";

const NOW = 1_700_000_000_000;

describe("liveExpiresAt", () => {
  it("is 24h after the session started", () => {
    expect(liveExpiresAt({ is_live: true, live_started_at: NOW })).toBe(NOW + LIVE_SESSION_MS);
  });

  it("is null when the gathering is not live", () => {
    expect(liveExpiresAt({ is_live: false, live_started_at: NOW })).toBeNull();
    expect(liveExpiresAt({ is_live: null, live_started_at: NOW })).toBeNull();
  });

  it("is null for a live row with no clock (legacy row written before the column)", () => {
    expect(liveExpiresAt({ is_live: true, live_started_at: null })).toBeNull();
  });

  it("is null for a missing gathering", () => {
    expect(liveExpiresAt(null)).toBeNull();
    expect(liveExpiresAt(undefined)).toBeNull();
  });
});

describe("isLiveNow", () => {
  it("is live inside the window", () => {
    const g = { is_live: true, live_started_at: NOW };
    expect(isLiveNow(g, NOW)).toBe(true);
    expect(isLiveNow(g, NOW + LIVE_SESSION_MS - 1)).toBe(true);
  });

  it("expires exactly at the 24h boundary", () => {
    const g = { is_live: true, live_started_at: NOW };
    expect(isLiveNow(g, NOW + LIVE_SESSION_MS)).toBe(false);
    expect(isLiveNow(g, NOW + LIVE_SESSION_MS + 1)).toBe(false);
  });

  it("expires a session the presenter never ended", () => {
    // The egress bug: is_live stayed true for weeks.
    const abandoned = { is_live: true, live_started_at: NOW };
    expect(isLiveNow(abandoned, NOW + 21 * 24 * 60 * 60 * 1000)).toBe(false);
  });

  it("fails closed on a live row with no clock", () => {
    expect(isLiveNow({ is_live: true, live_started_at: null }, NOW)).toBe(false);
  });

  it("is not live when the flag is off, whatever the clock says", () => {
    expect(isLiveNow({ is_live: false, live_started_at: NOW }, NOW)).toBe(false);
  });

  it("is not live when logged out (unknown state)", () => {
    expect(isLiveNow({ is_live: null, live_started_at: null }, NOW)).toBe(false);
  });
});

describe("liveMsRemaining", () => {
  it("counts down within the window", () => {
    const g = { is_live: true, live_started_at: NOW };
    expect(liveMsRemaining(g, NOW)).toBe(LIVE_SESSION_MS);
    expect(liveMsRemaining(g, NOW + 1000)).toBe(LIVE_SESSION_MS - 1000);
  });

  it("floors at zero once expired rather than going negative", () => {
    const g = { is_live: true, live_started_at: NOW };
    expect(liveMsRemaining(g, NOW + LIVE_SESSION_MS * 2)).toBe(0);
  });

  it("is null when not live", () => {
    expect(liveMsRemaining({ is_live: false, live_started_at: null }, NOW)).toBeNull();
  });
});
