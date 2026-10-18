import { describe, expect, it } from "vitest";
import { ACTIVE_POLL_MS, IDLE_AFTER_MS, IDLE_POLL_MS, nextPollDelay } from "../share-poll";

describe("nextPollDelay", () => {
  const NOW = 1_800_000_000_000;

  it("polls every 8 seconds while the gathering is changing", () => {
    expect(ACTIVE_POLL_MS).toBe(8_000);
    expect(nextPollDelay(NOW, NOW)).toBe(ACTIVE_POLL_MS);
    expect(nextPollDelay(NOW - IDLE_AFTER_MS + 1, NOW)).toBe(ACTIVE_POLL_MS);
  });

  it("eases off to once a minute after 30 quiet minutes", () => {
    expect(IDLE_POLL_MS).toBe(60_000);
    expect(nextPollDelay(NOW - IDLE_AFTER_MS, NOW)).toBe(IDLE_POLL_MS);
    expect(nextPollDelay(NOW - 7 * 24 * 60 * 60 * 1000, NOW)).toBe(IDLE_POLL_MS);
  });
});
