import { describe, it, expect } from "vitest";
import { alignVerses, translationLabel, TRANSLATION_GROUPS, type FetchedVerse } from "../bible";
import { alignedVersesToSlides, displayLinesForVersions } from "../versions";

const niv: FetchedVerse[] = [
  { chapter: 3, verse: 16, text: "For God so loved the world" },
  { chapter: 3, verse: 17, text: "For God did not send his Son" },
];
const cunps: FetchedVerse[] = [
  { chapter: 3, verse: 16, text: "神爱世人" },
  { chapter: 3, verse: 17, text: "因为神差他的儿子" },
];

describe("alignVerses", () => {
  it("pairs verses by number and reports nothing unmatched", () => {
    const { rows, unmatched } = alignVerses(
      { code: "NIV", verses: niv },
      { code: "CUNPS", verses: cunps },
    );
    expect(unmatched).toBe(0);
    expect(rows).toHaveLength(2);
    expect(rows[0].byVersion).toEqual({ NIV: "For God so loved the world", CUNPS: "神爱世人" });
  });

  it("counts verses the second version merged away, and leaves them single", () => {
    const { rows, unmatched } = alignVerses(
      { code: "NIV", verses: niv },
      { code: "CUNPS", verses: [cunps[0]] },
    );
    expect(unmatched).toBe(1);
    expect(rows[1].byVersion).toEqual({ NIV: "For God did not send his Son" });
  });

  it("lets the primary decide which verses exist, ignoring extras in the second", () => {
    const { rows } = alignVerses(
      { code: "NIV", verses: [niv[0]] },
      { code: "CUNPS", verses: cunps },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].verse).toBe(16);
  });

  it("matches on chapter as well as verse, so a cross-chapter range cannot cross-wire", () => {
    const { rows, unmatched } = alignVerses(
      { code: "NIV", verses: [{ chapter: 4, verse: 16, text: "chapter four" }] },
      { code: "CUNPS", verses: cunps },
    );
    expect(unmatched).toBe(1);
    expect(rows[0].byVersion.CUNPS).toBeUndefined();
  });

  it("is a plain passthrough with no second version", () => {
    const { rows, unmatched } = alignVerses({ code: "NIV", verses: niv });
    expect(unmatched).toBe(0);
    expect(rows[0].byVersion).toEqual({ NIV: "For God so loved the world" });
  });
});

describe("alignedVersesToSlides", () => {
  const { rows } = alignVerses({ code: "NIV", verses: niv }, { code: "CUNPS", verses: cunps });
  const slides = alignedVersesToSlides(rows, ["NIV", "CUNPS"], {
    NIV: "John 3:16",
    CUNPS: "约翰福音 3:16",
  });

  it("makes one slide per verse, referenced by book chapter and verse", () => {
    expect(slides).toHaveLength(2);
    expect(slides[0].reference).toBe("John 3:16");
    expect(slides[0].referencesByVersion?.CUNPS).toBe("约翰福音 3:16");
    expect(slides[0].kind).toBe("scripture");
  });

  it("puts the primary version in lines, for surfaces that predate stacking", () => {
    expect(slides[0].lines).toEqual(["For God so loved the world"]);
  });

  it("falls back to whatever version it has when the primary is missing", () => {
    const orphan = alignedVersesToSlides(
      [{ chapter: 3, verse: 16, text: "" } as never].map(() => ({
        chapter: 3,
        verse: 16,
        byVersion: { CUNPS: "神爱世人" },
      })),
      ["NIV", "CUNPS"],
      { NIV: "John 3:16", CUNPS: "约翰福音 3:16" },
    );
    expect(orphan[0].lines).toEqual(["神爱世人"]);
  });
});

describe("displayLinesForVersions", () => {
  const { rows } = alignVerses({ code: "NIV", verses: niv }, { code: "CUNPS", verses: [cunps[0]] });
  const slides = alignedVersesToSlides(rows, ["NIV", "CUNPS"], {
    NIV: "John 3:16",
    CUNPS: "约翰福音 3:16",
  });

  it("stacks in the order the set asked for, not the stored order", () => {
    expect(displayLinesForVersions(slides[0], ["CUNPS", "NIV"]).map((l) => l.version)).toEqual([
      "CUNPS",
      "NIV",
    ]);
  });

  it("drops a version this verse has no text for", () => {
    expect(displayLinesForVersions(slides[1], ["NIV", "CUNPS"])).toHaveLength(1);
  });
});

describe("TRANSLATION_GROUPS", () => {
  it("covers every language the app offers for song lyrics", () => {
    const languages = TRANSLATION_GROUPS.map((g) => g.language);
    for (const lang of [
      "English",
      "Japanese",
      "Chinese",
      "Korean",
      "Indonesian",
      "Arabic",
      "Spanish",
      "Portuguese",
      "French",
    ]) {
      expect(languages).toContain(lang);
    }
  });

  it("has no duplicate translation codes across languages", () => {
    const codes = TRANSLATION_GROUPS.flatMap((g) => g.translations.map((t) => t.code));
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("labels a known code and falls back to the code itself otherwise", () => {
    expect(translationLabel("CUNPS")).toMatch(/Union/);
    expect(translationLabel("NOPE")).toBe("NOPE");
  });
});
