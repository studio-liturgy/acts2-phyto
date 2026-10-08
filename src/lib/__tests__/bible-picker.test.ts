import { beforeAll, describe, expect, it } from "vitest";
import { allTranslationGroups, searchTranslationGroups, versionAbbr } from "@/lib/bible";
import { loadYvNames, YV_BIBLES } from "@/lib/youversion";

// Runs first: the titles and language names haven't loaded yet.
it("offers every version by abbreviation before the titles load", () => {
  const groups = allTranslationGroups();
  const english = groups.find((g) => g.language === "English")!.translations;
  expect(english[0]).toEqual({ code: "yv:111", abbr: "NIV", label: "" });
  expect(english.find((t) => t.code === "ESV")?.label).toBe("English Standard Version");
  expect(groups.flatMap((g) => g.translations)).toHaveLength(YV_BIBLES.length + 29);
});

describe("allTranslationGroups", () => {
  let groups: ReturnType<typeof allTranslationGroups>;
  let codes: string[];
  const group = (language: string) => groups.find((g) => g.language === language)!;
  beforeAll(async () => {
    await loadYvNames();
    groups = allTranslationGroups();
    codes = groups.flatMap((g) => g.translations.map((t) => t.code));
  });

  it("titles every version once the names load", () => {
    expect(group("English").translations[0].label).toBe("New International Version");
  });

  it("offers every YouVersion Bible, and bolls only for what YouVersion lacks", () => {
    for (const b of YV_BIBLES) expect(codes).toContain(`yv:${b.id}`);
    expect(codes).toContain("ESV");
    expect(codes).toContain("CUV");
    expect(codes).toContain("KRV");
    // bolls codes YouVersion took over aren't offered twice.
    for (const old of ["NIV", "NASB", "AMP", "LBLA", "NVI", "NVIPT", "BDS", "FRLSG", "NAV"])
      expect(codes).not.toContain(old);
  });

  it("leads with phyto's languages, Chinese split by script", () => {
    expect(groups.slice(0, 6).map((g) => g.language)).toEqual([
      "English",
      "Japanese",
      "Chinese (simplified)",
      "Chinese (traditional)",
      "Korean",
      "Indonesian",
    ]);
  });

  it("lists widely spoken languages A-Z after phyto's, then the rest A-Z", () => {
    const names = groups.map((g) => g.language);
    // The first of the rest: YouVersion spells it "'Auhelawa".
    const rest = names.findIndex((n) => n.includes("Auhelawa"));
    const common = names.slice(10, rest);
    expect(common).toEqual([...common].sort((a, b) => a.localeCompare(b, "en")));
    for (const l of ["German", "Russian", "Hindi", "Hindi (Roman script)", "Vietnamese", "Thai"])
      expect(common).toContain(l);
    expect(rest).toBe(10 + common.length);
    expect(common.at(-1)).toBe("Yoruba");
  });

  it("lists YouVersion first in a language, the versions phyto offered before on top", () => {
    const english = group("English").translations.map((t) => t.abbr);
    expect(english.slice(0, 3)).toEqual(["NIV", "NASB1995", "AMP"]);
    const firstBolls = english.indexOf("NLT");
    expect(firstBolls).toBeGreaterThan(3);
    expect(english.slice(firstBolls)).toEqual(["NLT", "ESV", "NRSVCE", "NKJV", "KJV", "MSG"]);
    expect(group("German").translations.map((t) => t.abbr)).toContain("SCH2000");
    expect(group("Korean").translations.map((t) => t.code)).toEqual(["yv:86", "KRV", "RNKSV"]);
  });
});

describe("searchTranslationGroups", () => {
  let groups: ReturnType<typeof allTranslationGroups>;
  beforeAll(async () => {
    await loadYvNames();
    groups = allTranslationGroups();
  });
  const codes = (q: string) =>
    searchTranslationGroups(groups, q).flatMap((g) => g.translations.map((t) => t.code));

  it("matches an abbreviation or a title, case-insensitively", () => {
    expect(codes("esv")).toEqual(["ESV"]);
    expect(codes("king james")).toEqual(expect.arrayContaining(["NKJV", "KJV", "JPKJV"]));
    // A YouVersion Bible's English title counts too.
    expect(codes("korean living")).toEqual(["yv:86"]);
  });

  it("matches a language, listing every version in it", () => {
    expect(codes("korean")).toEqual(["yv:86", "KRV", "RNKSV"]);
  });

  it("ignores accents", () => {
    expect(codes("versao internacional")).toContain("yv:129");
  });

  it("returns everything for an empty query and nothing for a miss", () => {
    expect(searchTranslationGroups(groups, "  ")).toBe(groups);
    expect(searchTranslationGroups(groups, "qqzzqq")).toEqual([]);
  });
});

it("shows a version by its abbreviation, the old bolls codes included", () => {
  expect(versionAbbr("yv:111")).toBe("NIV");
  expect(versionAbbr("NIV")).toBe("NIV");
  expect(versionAbbr("CUNPS")).toBe("CUNPS");
  expect(versionAbbr("yv:999999")).toBe("yv:999999");
});
