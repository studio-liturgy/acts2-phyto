import { describe, expect, it } from "vitest";
import { allTranslationGroups, searchTranslationGroups, TRANSLATION_CODES } from "@/lib/bible";

describe("allTranslationGroups", () => {
  it("offers every version, Chinese split by script", () => {
    const groups = allTranslationGroups();
    const codes = groups.flatMap((g) => g.translations.map((t) => t.code));
    expect(new Set(codes)).toEqual(new Set(TRANSLATION_CODES));
    expect(codes).toHaveLength(TRANSLATION_CODES.size);
    expect(groups[0].language).toBe("English");
    expect(groups.map((g) => g.language)).toContain("Chinese (traditional)");
    expect(groups.map((g) => g.language)).toContain("Chinese (simplified)");
  });
});

describe("searchTranslationGroups", () => {
  const groups = allTranslationGroups();
  const codes = (q: string) =>
    searchTranslationGroups(groups, q).flatMap((g) => g.translations.map((t) => t.code));

  it("matches a code or a name, case-insensitively", () => {
    expect(codes("esv")).toEqual(["ESV"]);
    expect(codes("king james")).toEqual(["NKJV", "KJV", "JPKJV"]);
  });

  it("matches a language, listing every version in it", () => {
    expect(codes("korean")).toEqual(["KRV", "RNKSV"]);
    expect(codes("traditional")).toEqual(["CUV", "CUNP", "PCB", "ChiSB"]);
  });

  it("ignores accents", () => {
    expect(codes("versao")).toContain("NVIPT");
  });

  it("returns everything for an empty query and nothing for a miss", () => {
    expect(searchTranslationGroups(groups, "  ")).toBe(groups);
    expect(searchTranslationGroups(groups, "zzz")).toEqual([]);
  });
});
