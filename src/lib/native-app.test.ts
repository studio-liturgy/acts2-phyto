import { describe, expect, it } from "vitest";
import { appSimParam, isIpadBrowser, isTablet, nativePlatformFromUA } from "./native-app";
import { noAccountAllowed } from "./no-account";
import { NATIVE_FEEL, RHYTHMS, VIBRATE_MS, rhythmBeats, rhythmVibration } from "./haptics";

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

describe("isTablet", () => {
  it("spots iPads in Safari and inside the app", () => {
    expect(isTablet(IPAD_SAFARI, 5)).toBe(true);
    expect(isTablet(`${IPAD_SAFARI} phyto-app/ios`, 5)).toBe(true);
    expect(isTablet("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)", 5)).toBe(true);
  });
  it("spots Android tablets, not Android phones", () => {
    expect(isTablet("Mozilla/5.0 (Linux; Android 15; SM-X710) Chrome/141 Safari/537.36", 5)).toBe(
      true,
    );
    expect(
      isTablet("Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/141 Mobile Safari/537.36", 5),
    ).toBe(false);
  });
  it("leaves iPhones and Macs alone", () => {
    expect(isTablet(`${IPHONE_SAFARI} phyto-app/ios`, 5)).toBe(false);
    expect(isTablet(IPAD_SAFARI, 0)).toBe(false);
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
    expect(Object.keys(VIBRATE_MS).sort()).toEqual(["firm", "select", "success", "tap", "warning"]);
  });
  it("makes the remote's live changes firmer than a plain tap", () => {
    expect(NATIVE_FEEL.firm).toEqual({ impact: "MEDIUM" });
    expect(NATIVE_FEEL.tap).toEqual({ impact: "LIGHT" });
    expect(Object.keys(NATIVE_FEEL).sort()).toEqual(Object.keys(VIBRATE_MS).sort());
  });
});

describe("haptic rhythms", () => {
  it("keeps his three rhythms as he wrote them", () => {
    expect(RHYTHMS).toEqual({ goLive: "-.-.-", connect: ".-.-", disconnect: "..-..-" });
  });
  it("plays heavy for a dash and light for a dot, in order", () => {
    expect(rhythmBeats(RHYTHMS.goLive).map((b) => b.heavy)).toEqual([
      true,
      false,
      true,
      false,
      true,
    ]);
    expect(rhythmBeats(RHYTHMS.disconnect).map((b) => b.heavy)).toEqual([
      false,
      false,
      true,
      false,
      false,
      true,
    ]);
  });
  it("is short: going live is over in under half a second", () => {
    const beats = rhythmBeats(RHYTHMS.goLive);
    expect(beats[0].at).toBe(0);
    expect(beats[beats.length - 1].at).toBeLessThan(500);
    expect(beats.map((b) => b.at)).toEqual([0, 110, 180, 290, 360]);
  });
  it("gives Android browsers the same rhythm as on, off pairs", () => {
    expect(rhythmVibration(RHYTHMS.connect)).toEqual([12, 58, 35, 75, 12, 58, 35]);
  });
});
