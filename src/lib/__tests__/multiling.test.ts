import { describe, expect, it } from "vitest";
import {
  clearColumnRange,
  editedLangLines,
  insertColumnCell,
  multilangToStandard,
  pasteDownColumn,
  removeColumnCell,
  restackSlides,
  rowsToSlides,
  shownLangs,
  slidesToRows,
  standardToRows,
  type MultiRow,
} from "@/lib/multiling";
import { phoneSetForLangs } from "@/lib/phone-viewer";
import type { Slide } from "@/lib/types";

const rows: MultiRow[] = [
  { kind: "section", text: "Verse 1" },
  { kind: "line", byLang: { en: "Amazing grace", ja: "おどろくばかりの", es: "Sublime gracia" } },
  { kind: "line", byLang: { en: "How sweet the sound", ja: "めぐみなりき" } },
  { kind: "section", text: "Chorus" },
  { kind: "line", byLang: {} },
  { kind: "line", byLang: { ja: "ただ" } },
];

const strip = (slides: Slide[]) => slides.map(({ id: _id, ...rest }) => rest);

describe("multilanguage rows and slides", () => {
  it("stacks the shown languages in column order and keeps every language", () => {
    const slides = rowsToSlides(rows, ["ja", "en"]);
    expect(strip(slides)).toEqual([
      {
        kind: "lyric",
        lines: ["おどろくばかりの", "Amazing grace"],
        lineLangs: ["ja", "en"],
        linesByLang: { en: "Amazing grace", ja: "おどろくばかりの", es: "Sublime gracia" },
        section: "Verse 1",
      },
      {
        kind: "lyric",
        lines: ["めぐみなりき", "How sweet the sound"],
        lineLangs: ["ja", "en"],
        linesByLang: { en: "How sweet the sound", ja: "めぐみなりき" },
        section: "Verse 1",
      },
      {
        kind: "lyric",
        lines: ["ただ"],
        lineLangs: ["ja"],
        linesByLang: { ja: "ただ" },
        section: "Chorus",
      },
    ]);
  });

  it("round-trips slides back to rows (blank rows make no slide)", () => {
    const back = slidesToRows(rowsToSlides(rows, ["en"]));
    expect(back).toEqual(rows.filter((r) => r.kind !== "line" || Object.keys(r.byLang).length));
  });

  it("caps the shown languages at four, in column order", () => {
    expect(shownLangs(["en", "ja", "ko", "es", "fr"])).toEqual(["en", "ja", "ko", "es"]);
    expect(shownLangs(["en", "ja", "ko"], ["ko", "en"])).toEqual(["en", "ko"]);
    expect(shownLangs(["en", "ja"], ["fr"])).toEqual(["en", "ja"]);
  });

  it("restacks for a new choice without touching the words", () => {
    const slides = rowsToSlides(rows, ["en", "ja"]);
    const es = restackSlides(slides, ["es"]);
    expect(es[0].lines).toEqual(["Sublime gracia"]);
    expect(es[1].lines).toEqual([]);
    expect(es[1].lineLangs).toBeUndefined();
    expect(es[0].linesByLang).toEqual(slides[0].linesByLang);
    expect(es[0].id).toBe(slides[0].id);
  });
});

describe("switching layouts keeps every word", () => {
  const standard: Slide[] = [
    { id: "a", kind: "lyric", lines: ["Line one", "Line two"], section: "Verse" },
    { id: "b", kind: "lyric", lines: ["Line three"], section: "Verse" },
    { id: "c", kind: "lyric", lines: ["Hallelujah"], section: "Chorus" },
  ];

  it("Standard into Multilanguage: one row per line, in the chosen language", () => {
    expect(standardToRows(standard, "en")).toEqual([
      { kind: "section", text: "Verse" },
      { kind: "line", byLang: { en: "Line one" } },
      { kind: "line", byLang: { en: "Line two" } },
      { kind: "line", byLang: { en: "Line three" } },
      { kind: "section", text: "Chorus" },
      { kind: "line", byLang: { en: "Hallelujah" } },
    ]);
  });

  it("Multilanguage back to Standard: every language stacked, hidden ones too", () => {
    const slides = rowsToSlides(rows, ["en"]);
    const plain = multilangToStandard(slides, ["en", "ja"]);
    expect(plain[0].lines).toEqual(["Amazing grace", "おどろくばかりの", "Sublime gracia"]);
    expect(plain[0].linesByLang).toBeUndefined();
    expect(plain[2].lines).toEqual(["ただ"]);
  });
});

describe("one-column edits", () => {
  const grid: MultiRow[] = [
    { kind: "line", byLang: { en: "a", ja: "あ" } },
    { kind: "section", text: "Chorus" },
    { kind: "line", byLang: { en: "b", ja: "い" } },
  ];

  it("Cmd+Enter opens a cell below in one language, adding a row at the end", () => {
    const next = insertColumnCell(grid, 0, "ja");
    expect(next).toEqual([
      { kind: "line", byLang: { en: "a", ja: "あ" } },
      { kind: "section", text: "Chorus" },
      { kind: "line", byLang: { en: "b" } },
      { kind: "line", byLang: { ja: "い" } },
    ]);
    expect(removeColumnCell(next, 2, "ja")).toEqual(grid);
  });

  it("pastes down a column, skipping sections", () => {
    expect(pasteDownColumn(grid, 0, "es", ["uno", "dos", "tres"])).toEqual([
      { kind: "line", byLang: { en: "a", ja: "あ", es: "uno" } },
      { kind: "section", text: "Chorus" },
      { kind: "line", byLang: { en: "b", ja: "い", es: "dos" } },
      { kind: "line", byLang: { es: "tres" } },
    ]);
  });

  it("clearing a run removes rows left with no words", () => {
    const one: MultiRow[] = [
      { kind: "line", byLang: { en: "a" } },
      { kind: "line", byLang: { en: "b", ja: "い" } },
    ];
    expect(clearColumnRange(one, "en", 0, 1)).toEqual([{ kind: "line", byLang: { ja: "い" } }]);
  });
});

describe("phone language choice", () => {
  it("stacks the phone's own languages in column order", () => {
    const set = {
      id: "s",
      title: "Song",
      type: "song",
      langs: ["en", "ja", "es"],
      slides: [
        {
          kind: "lyric",
          lines: ["Amazing grace"],
          linesByLang: { en: "Amazing grace", ja: "おどろく", es: "Sublime" },
        },
      ],
    };
    expect(phoneSetForLangs(set, ["es", "ja"]).slides[0].lines).toEqual(["おどろく", "Sublime"]);
    expect(phoneSetForLangs(set, undefined)).toBe(set);
  });
});

describe("Fast Edit on a Multilanguage slide", () => {
  it("writes each edited line back into its language", () => {
    const [slide] = rowsToSlides(rows, ["ja", "en"]);
    const patch = editedLangLines(slide, ["おどろく", "Amazing love"]);
    expect(patch.linesByLang).toEqual({ en: "Amazing love", ja: "おどろく", es: "Sublime gracia" });
    expect(editedLangLines({ id: "x", kind: "lyric", lines: ["a"] }, ["b"])).toEqual({
      lines: ["b"],
    });
  });
});
