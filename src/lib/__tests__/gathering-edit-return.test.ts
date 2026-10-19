import { beforeEach, describe, expect, it } from "vitest";
import { markGatheringEditReturn, takeGatheringEditReturn } from "../gathering-edit-return";

describe("reopening a gathering in edit mode after editing one of its sets", () => {
  beforeEach(() => sessionStorage.clear());

  it("hands back the gathering once, then nothing", () => {
    markGatheringEditReturn("g1");
    expect(takeGatheringEditReturn()).toBe("g1");
    expect(takeGatheringEditReturn()).toBeNull();
  });

  it("is nothing when no set was opened from a gathering", () => {
    expect(takeGatheringEditReturn()).toBeNull();
  });

  it("follows the latest gathering", () => {
    markGatheringEditReturn("g1");
    markGatheringEditReturn("g2");
    expect(takeGatheringEditReturn()).toBe("g2");
  });
});
