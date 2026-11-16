import { describe, expect, it } from "vitest";
import { cjkSerifStack, endsWithSerif, langFontStack, serifBaseStack } from "@/lib/langs";

const SERIF = "'Times New Roman', Times, serif";
const SANS = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

describe("Chinese serif", () => {
  it("tells serif stacks from sans-serif ones", () => {
    expect(endsWithSerif(SERIF)).toBe(true);
    expect(endsWithSerif("Georgia, serif")).toBe(true);
    expect(endsWithSerif(SANS)).toBe(false);
  });

  it("puts the Chinese serif before the generic family", () => {
    const stack = serifBaseStack("Georgia, serif");
    expect(stack.startsWith("Georgia, 'Noto Serif SC Variable'")).toBe(true);
    expect(stack.endsWith(", serif")).toBe(true);
    expect(serifBaseStack(SANS)).toBe(SANS);
  });

  it("gives tagged Chinese lines their own serif under a serif template", () => {
    expect(langFontStack("zh", SERIF)).toMatch(
      /^'Times New Roman', Times, 'Noto Serif SC Variable'.*, serif$/,
    );
    expect(langFontStack("zh-Hant-TW", SERIF)).toContain("'Noto Serif TC Variable'");
    expect(langFontStack("ja", SERIF)).toContain("'Hiragino Mincho ProN'");
    // Sans templates keep the sans fallbacks.
    expect(langFontStack("zh", SANS)).toBe(
      `${SANS}, 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei'`,
    );
  });

  it("sets untagged lines by what they hold", () => {
    expect(cjkSerifStack(SERIF, "尊贵荣耀君王")).toContain("'Noto Serif SC Variable'");
    expect(cjkSerifStack(SERIF, "主の栄光")).toContain("'Hiragino Mincho ProN'");
    expect(cjkSerifStack(SERIF, "尊貴榮耀君王", "zh-Hant-TW")).toContain(
      "'Noto Serif TC Variable'",
    );
    expect(cjkSerifStack(SERIF, "The splendour of a King")).toBeUndefined();
    expect(cjkSerifStack(SANS, "尊贵荣耀君王")).toBeUndefined();
  });
});
