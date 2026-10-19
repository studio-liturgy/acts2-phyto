import { describe, expect, it } from "vitest";
import { PUSH_DEBOUNCE_MS, PUSH_RETRY_MAX_MS, pushRetryDelay } from "@/lib/push-retry";

describe("pushRetryDelay", () => {
  it("is the normal debounce with no failures", () => {
    expect(pushRetryDelay(0)).toBe(PUSH_DEBOUNCE_MS);
  });

  it("doubles on each failure in a row", () => {
    expect([1, 2, 3, 4].map(pushRetryDelay)).toEqual([1000, 2000, 4000, 8000]);
  });

  it("never waits more than a minute", () => {
    expect(pushRetryDelay(7)).toBe(PUSH_RETRY_MAX_MS);
    expect(pushRetryDelay(50)).toBe(PUSH_RETRY_MAX_MS);
  });
});
