import { describe, expect, it } from "vitest";
import { appSimParam, isIpadBrowser, nativePlatformFromUA } from "./native-app";
import { noAccountAllowed } from "./no-account";
import { VIBRATE_MS } from "./haptics";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1";
const IPAD_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15";

describe("nativePlatformFromUA", () => {
  it("reads the app's token", () => {
    expect(nativePlatformFromUA(`${IPHONE_SAFARI} phyto-app/ios`)).toBe("ios");
    expect(nativePlatformFromUA("Mozilla/5.0 (Linux; Android 15) wv phyto-app/android")).toBe(
      "android",
    );
  });
  it("is null in a plain browser", () => {
    expect(nativePlatformFromUA(IPHONE_SAFARI)).toBeNull();
    expect(nativePlatformFromUA("phyto-app/windows")).toBeNull();
  });
});

describe("appSimParam", () => {
  it("takes ios, android and off only", () => {
    expect(appSimParam("?app=ios")).toBe("ios");
    expect(appSimParam("?tab=settings&app=android")).toBe("android");
    expect(appSimParam("?app=off")).toBe("off");
    expect(appSimParam("?app=mac")).toBeNull();
    expect(appSimParam("")).toBeNull();
  });
});

describe("isIpadBrowser", () => {
  it("spots iPadOS Safari by touch on a Mac user agent", () => {
    expect(isIpadBrowser(IPAD_SAFARI, 5)).toBe(true);
  });
  it("leaves real Macs and phones alone", () => {
    expect(isIpadBrowser(IPAD_SAFARI, 0)).toBe(false);
    expect(isIpadBrowser(IPHONE_SAFARI, 5)).toBe(false);
  });
  it("is never true inside the app", () => {
    expect(isIpadBrowser(`${IPAD_SAFARI} phyto-app/ios`, 5)).toBe(false);
  });
});

describe("noAccountAllowed", () => {
  it("needs both the app and the choice", () => {
    expect(noAccountAllowed(true, true)).toBe(true);
    expect(noAccountAllowed(true, false)).toBe(false);
    expect(noAccountAllowed(false, true)).toBe(false);
  });
});

describe("haptics", () => {
  it("has a vibration for every kind", () => {
    expect(Object.keys(VIBRATE_MS).sort()).toEqual(["select", "success", "tap", "warning"]);
  });
});
