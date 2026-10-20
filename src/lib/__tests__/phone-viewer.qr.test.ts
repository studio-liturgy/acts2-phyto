import { describe, expect, it } from "vitest";
import { phoneQrColors, phoneQrUrl } from "@/lib/phone-viewer";

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
