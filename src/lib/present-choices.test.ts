import { describe, expect, it } from "vitest";
import { canAddGathering, presentChoices, presentTabShown } from "./phone-layout";

describe("presentTabShown", () => {
  it("shows while a gathering is live", () => {
    expect(presentTabShown(true, false, 3)).toBe(true);
  });
  it("shows without an account once the gathering exists", () => {
    expect(presentTabShown(false, true, 1)).toBe(true);
    expect(presentTabShown(false, true, 0)).toBe(false);
  });
  it("stays hidden signed in with nothing live", () => {
    expect(presentTabShown(false, false, 4)).toBe(false);
  });
});

describe("canAddGathering", () => {
  it("allows one gathering without an account", () => {
    expect(canAddGathering(false, 0)).toBe(true);
    expect(canAddGathering(false, 1)).toBe(false);
  });
  it("has no limit with an account", () => {
    expect(canAddGathering(true, 12)).toBe(true);
  });
});

describe("presentChoices", () => {
  it("offers both in the app, signed in and live", () => {
    expect(presentChoices({ nativeApp: true, signedIn: true, live: true })).toEqual({
      present: true,
      remote: true,
    });
  });
  it("hides Remote without an account", () => {
    expect(presentChoices({ nativeApp: true, signedIn: false, live: false })).toEqual({
      present: true,
      remote: false,
    });
  });
  it("keeps the browser to Remote", () => {
    expect(presentChoices({ nativeApp: false, signedIn: true, live: true })).toEqual({
      present: false,
      remote: true,
    });
  });
});
