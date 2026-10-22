import { describe, expect, it } from "vitest";
import { hexToHsv, hsvToHex, normalizeHex } from "../color";

describe("color", () => {
  it("round-trips the brand colours", () => {
    for (const hex of ["#2e7299", "#538844", "#e07d31", "#c01e21", "#212121", "#f5efef"]) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });

  it("reads the primaries", () => {
    expect(hexToHsv("#ff0000")).toEqual({ h: 0, s: 1, v: 1 });
    expect(hexToHsv("#00ff00").h).toBe(120);
    expect(hexToHsv("#0000ff").h).toBe(240);
    expect(hsvToHex({ h: 240, s: 1, v: 1 })).toBe("#0000ff");
  });

  it("keeps the hue for greys", () => {
    expect(hexToHsv("#808080", 200).h).toBe(200);
    expect(hexToHsv("#000000", 33)).toEqual({ h: 33, s: 0, v: 0 });
  });

  it("normalizes typed hex", () => {
    expect(normalizeHex("ABC")).toBe("#aabbcc");
    expect(normalizeHex(" #2E7299 ")).toBe("#2e7299");
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("zzzzzz")).toBeNull();
  });
});
