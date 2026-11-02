import { describe, expect, it } from "vitest";
import { guessDevice } from "./feedback-device";

describe("guessDevice", () => {
  it("iPhone Safari", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
    expect(guessDevice(ua, true)).toEqual({ device: "Phone", detail: "iOS 18, Safari" });
  });

  it("iPhone Chrome", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1";
    expect(guessDevice(ua, true)).toEqual({ device: "Phone", detail: "iOS 17, Chrome" });
  });

  it("Android phone Chrome", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
    expect(guessDevice(ua, true)).toEqual({ device: "Phone", detail: "Android 14, Chrome" });
  });

  it("Samsung Internet", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36";
    expect(guessDevice(ua, true).detail).toBe("Android 13, Samsung Internet");
  });

  it("iPad reporting as a Mac is a tablet when it has touch", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
    expect(guessDevice(ua, true)).toEqual({ device: "Tablet", detail: "iPadOS, Safari" });
    expect(guessDevice(ua, false)).toEqual({ device: "Computer", detail: "macOS, Safari" });
  });

  it("Android tablet (no Mobile token)", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
    expect(guessDevice(ua, true).device).toBe("Tablet");
  });

  it("Windows Edge", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0";
    expect(guessDevice(ua)).toEqual({ device: "Computer", detail: "Windows, Edge" });
  });

  it("unknown agent", () => {
    expect(guessDevice("")).toEqual({ device: "Computer", detail: "" });
  });
});
