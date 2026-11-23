import { describe, expect, it } from "vitest";
import { inAppPath } from "./testers";

describe("inAppPath", () => {
  it("keeps only the live link's path", () => {
    expect(inAppPath("https://phyto.live/g/grace-church")).toBe("/g/grace-church");
  });

  it("keeps a query string", () => {
    expect(inAppPath("https://phytoexp.live/g/abc?x=1")).toBe("/g/abc?x=1");
  });

  it("returns a path as is", () => {
    expect(inAppPath("/g/abc")).toBe("/g/abc");
  });
});
