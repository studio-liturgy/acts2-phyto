import { describe, expect, it } from "vitest";
import { refreshAfterGo } from "../live-refresh";

describe("refreshAfterGo", () => {
  const live = { setId: "s", slideId: "a", slideOcc: 0, refresh: 2 };
  it("clicking the live slide again bumps it", () => {
    expect(refreshAfterGo(live, "s", "a", 0)).toBe(3);
  });
  it("another slide, set or repeat leaves it", () => {
    expect(refreshAfterGo(live, "s", "b", 0)).toBe(2);
    expect(refreshAfterGo(live, "t", "a", 0)).toBe(2);
    expect(refreshAfterGo(live, "s", "a", 1)).toBe(2);
  });
  it("starts from nothing", () => {
    expect(refreshAfterGo({ setId: "s", slideId: "a" }, "s", "a", 0)).toBe(1);
  });
});
