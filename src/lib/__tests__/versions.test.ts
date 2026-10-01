import { describe, expect, it } from "vitest";
import {
  hasStackedVersions,
  inferredVersions,
  pairedVersion,
  recentVersions,
  reimportQueries,
  versionsMismatchWorkspace,
  versionsOutsideLanguages,
  visibleVersions,
  WORKSPACE_LANGUAGE_CHECKS,
} from "@/lib/versions";
import { slidesToVersionText, versionTextToSlides } from "@/lib/slide-text";
import type { Slide } from "@/lib/types";

const verse = (id: string, en: string, zh: string): Slide => ({
  id,
  kind: "scripture",
  reference: "John 3:16",
  section: "John 3:16",
  importIndex: 0,
  lines: [en],
  linesByVersion: { NIV: en, CUNPS: zh },
  referencesByVersion: { NIV: "John 3:16", CUNPS: "約翰福音 3:16" },
});
const stacked = {
  versions: ["NIV", "CUNPS"],
  slides: [verse("a", "For God so loved", "神愛世人")],
};

describe("visibleVersions", () => {
  it("is undefined for a set that doesn't stack (renders from lines)", () => {
    expect(visibleVersions({ versions: ["NIV"], slides: stacked.slides })).toBeUndefined();
    const plain: Slide = { id: "x", kind: "scripture", lines: ["plain"] };
    expect(visibleVersions({ slides: [plain] })).toBeUndefined();
    expect(hasStackedVersions(stacked)).toBe(true);
  });

  it("projects every version the set carries, in the set's order", () => {
    expect(visibleVersions(stacked)).toEqual(["NIV", "CUNPS"]);
    // The SET's order rules (a swap in the editor flips it).
    expect(visibleVersions({ versions: ["CUNPS", "NIV"], slides: stacked.slides })).toEqual([
      "CUNPS",
      "NIV",
    ]);
  });
});

describe("version boxes round-trip", () => {
  it("rebuilds the same verses from the per-version boxes", () => {
    const boxes = slidesToVersionText(stacked.slides, stacked.versions);
    expect(boxes.NIV).toBe("[John 3:16]\nFor God so loved");
    expect(boxes.CUNPS).toBe("[約翰福音 3:16]\n神愛世人");
    const rebuilt = versionTextToSlides(boxes, stacked.versions);
    expect(rebuilt).toHaveLength(1);
    expect(rebuilt[0].linesByVersion).toEqual({ NIV: "For God so loved", CUNPS: "神愛世人" });
    expect(rebuilt[0].referencesByVersion).toEqual({ NIV: "John 3:16", CUNPS: "約翰福音 3:16" });
    expect(rebuilt[0].lines).toEqual(["For God so loved"]);
  });
});

describe("versionsMismatchWorkspace", () => {
  it("never flags a set while workspace languages don't restrict versions", () => {
    expect(WORKSPACE_LANGUAGE_CHECKS).toBe(false);
    expect(
      versionsMismatchWorkspace(["CUNPS"], {
        multiLanguage: false,
        language: "en",
        language2: null,
      }),
    ).toBe(false);
  });
});

describe("versionsOutsideLanguages (the dormant rule)", () => {
  const off = (language: "en" | "fr" | "zh-Hans") =>
    ({ multiLanguage: false, language, language2: null }) as const;
  const on = (language: "en" | "fr" | "zh-Hans", language2: "en" | "fr" | "ja") =>
    ({ multiLanguage: true, language, language2 }) as const;

  it("off: fine when the set has the system language, extras included", () => {
    expect(versionsOutsideLanguages(["FRLSG", "NIV"], off("en"))).toBe(false);
    expect(versionsOutsideLanguages(["NIV", "ESV"], off("en"))).toBe(false);
    expect(versionsOutsideLanguages(["FRLSG"], off("en"))).toBe(true);
    // Chinese is one language: either script fits a Chinese workspace.
    expect(versionsOutsideLanguages(["CUNPS"], off("zh-Hans"))).toBe(false);
    expect(versionsOutsideLanguages(["CUNP"], off("zh-Hans"))).toBe(false);
    expect(versionsOutsideLanguages(["CUNP", "CUNPS"], off("zh-Hans"))).toBe(false);
  });

  it("multi: fine when every version is one of the two languages, one version included", () => {
    expect(versionsOutsideLanguages(["NIV", "FRLSG"], on("fr", "en"))).toBe(false);
    expect(versionsOutsideLanguages(["NIV"], on("fr", "en"))).toBe(false);
    expect(versionsOutsideLanguages(["CUNPS", "NIV"], on("fr", "en"))).toBe(true);
    expect(versionsOutsideLanguages(["CUNPS"], on("fr", "en"))).toBe(true);
    expect(versionsOutsideLanguages(undefined, on("fr", "en"))).toBe(false);
  });
});

describe("legacy single-version sets", () => {
  const legacy = {
    kind: "scripture",
    slides: [
      { id: "a", kind: "scripture", reference: "Psalms 100:4 NIV", lines: ["Enter his gates"] },
      { id: "b", kind: "scripture", reference: "Psalms 100:4 NIV", lines: ["with thanksgiving"] },
      { id: "c", kind: "scripture", reference: "John 3:16 NIV", lines: ["For God"] },
    ],
  };

  it("reads the version off the reference label", () => {
    expect(inferredVersions(legacy)).toEqual(["NIV"]);
    expect(
      versionsOutsideLanguages(inferredVersions(legacy), {
        multiLanguage: false,
        language: "zh-Hans",
        language2: null,
      }),
    ).toBe(true);
  });

  it("re-imports what is in the set, never the import history", () => {
    expect(reimportQueries(legacy)).toEqual(["Psalms 100:4", "John 3:16"]);
    // A passage deleted since import is not brought back by the record of it.
    expect(
      reimportQueries({ ...legacy, scriptureImports: ["Ps 100", "Jn 3:16-18", "Ruth 1"] }),
    ).toEqual(["Psalms 100:4", "John 3:16"]);
    // The same passage imported twice is two imports.
    const twice = {
      slides: [
        { id: "a", kind: "scripture", reference: "John 3:16 NIV", importIndex: 0 },
        { id: "b", kind: "scripture", reference: "John 3:16 NIV", importIndex: 1 },
      ],
    };
    expect(reimportQueries(twice)).toEqual(["John 3:16", "John 3:16"]);
    // Only verses without references fall back to the record.
    expect(reimportQueries({ scriptureImports: ["Ps 100"], slides: [] })).toEqual(["Ps 100"]);
  });
});

describe("reimportQueries skips hand-typed verses", () => {
  it("only fetched passages are queried again", async () => {
    const { reimportQueries } = await import("@/lib/versions");
    expect(
      reimportQueries({
        slides: [
          { kind: "scripture", reference: "John 3:16 NIV", importIndex: 0 },
          { kind: "scripture", reference: "Our creed", importIndex: 1, manual: true },
          { kind: "scripture", reference: "Psalms 23:1 NIV", importIndex: 2 },
        ],
      }),
    ).toEqual(["John 3:16", "Psalms 23:1"]);
  });
});

describe("version history", () => {
  const set = (updatedAt: number, versions: string[] | undefined, stackedSlides = false) => ({
    kind: "scripture",
    versions,
    updatedAt,
    slides: [
      {
        kind: "scripture",
        reference: "John 3:16 NIV",
        ...(stackedSlides ? { linesByVersion: { a: "a" } } : {}),
      },
    ],
  });

  it("lists the versions of previous sets, most recently changed first, each once", () => {
    const sets = [set(1, ["ESV"]), set(3, ["CUNPS", "NIV"], true), set(2, ["NIV"])];
    expect(recentVersions(sets)).toEqual(["CUNPS", "NIV", "ESV"]);
    expect(recentVersions(sets, 2)).toEqual(["CUNPS", "NIV"]);
    // A set with no recorded versions is read off its reference labels.
    expect(recentVersions([set(1, undefined)])).toEqual(["NIV"]);
    expect(recentVersions([])).toEqual([]);
  });

  it("pairs a 1st version with the 2nd of the most recent two-version set", () => {
    const sets = [set(1, ["NIV", "KRV"], true), set(2, ["ESV", "CUNPS"], true), set(3, ["NLT"])];
    expect(pairedVersion(sets, "NIV")).toBe("CUNPS");
    // That set's 2nd is the 1st already: its 1st instead.
    expect(pairedVersion(sets, "CUNPS")).toBe("ESV");
    // No two-version set: the most recent other version used.
    expect(pairedVersion([set(2, ["NLT"]), set(1, ["ESV"])], "NLT")).toBe("ESV");
    expect(pairedVersion([set(1, ["NIV"])], "NIV")).toBeUndefined();
  });
});
