import { describe, expect, it } from "vitest";
import { showAppStoreBanner } from "@/lib/app-store";

const base = { pathname: "/", signedIn: true, nativeApp: false, dismissed: false };

describe("showAppStoreBanner", () => {
  it("shows on the home page of a browser, signed in", () => {
    expect(showAppStoreBanner(base)).toBe(true);
  });

  it("never shows in the app, signed out, once closed, or off the home page", () => {
    expect(showAppStoreBanner({ ...base, nativeApp: true })).toBe(false);
    expect(showAppStoreBanner({ ...base, signedIn: false })).toBe(false);
    expect(showAppStoreBanner({ ...base, dismissed: true })).toBe(false);
    expect(showAppStoreBanner({ ...base, pathname: "/present" })).toBe(false);
    expect(showAppStoreBanner({ ...base, pathname: "/output" })).toBe(false);
  });
});
