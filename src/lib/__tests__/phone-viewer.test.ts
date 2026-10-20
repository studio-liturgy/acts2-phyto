import { describe, expect, it } from "vitest";
import { centeredTabScroll, phoneQrColors, phoneQrUrl } from "@/lib/phone-viewer";

describe("phoneQrUrl", () => {
  it("keeps the /g link and drops query and hash", () => {
    expect(phoneQrUrl("https://phytoexp.live/g/grace-hk?x=1#top")).toBe(
      "https://phytoexp.live/g/grace-hk",
    );
  });
  it("leaves a clean link as is", () => {
    expect(phoneQrUrl("https://phyto.live/g/abc123")).toBe("https://phyto.live/g/abc123");
  });
});

describe("phoneQrColors", () => {
  it("dark: off-white dots on black", () => {
    expect(phoneQrColors(true)).toEqual({ fg: "#F5EFEF", bg: "#000000" });
  });
  it("light: ink dots on white", () => {
    expect(phoneQrColors(false)).toEqual({ fg: "#212121", bg: "#ffffff" });
  });
});

describe("centeredTabScroll", () => {
  // Strip 300 wide, content 1000 wide (max scroll 700).
  it("centres a middle tab in the strip", () => {
    // Tab at 500..600: centre 550, minus half the strip (150) = 400.
    expect(centeredTabScroll(500, 100, 300, 1000)).toBe(400);
  });
  it("first tabs stay at the start", () => {
    expect(centeredTabScroll(0, 100, 300, 1000)).toBe(0);
    expect(centeredTabScroll(80, 100, 300, 1000)).toBe(0);
  });
  it("last tabs stop at the end", () => {
    expect(centeredTabScroll(900, 100, 300, 1000)).toBe(700);
  });
  it("no scrolling when every tab fits", () => {
    expect(centeredTabScroll(200, 100, 300, 280)).toBe(0);
  });
});
