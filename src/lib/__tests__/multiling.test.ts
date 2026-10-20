import { describe, expect, it } from "vitest";
import {
  clearColumnRange,
  editedLangLines,
  insertColumnCell,
  leaveMultilang,
  returnToMultilang,
  slideStarts,
  divideRows,
  sameDivision,
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
    const slides = rowsToSlides(divideRows(rows, 1), ["ja", "en"]);
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

  it("caps the shown languages at four, in the language bar's order", () => {
    expect(shownLangs(["en", "ja", "ko", "es", "fr"])).toEqual(["en", "ja", "ko", "es"]);
    expect(shownLangs(["en", "ja", "ko"], ["ko", "en"])).toEqual(["ko", "en"]);
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

  it("Standard into Multilanguage: one row per line, breaks kept", () => {
    expect(standardToRows(standard, "en")).toEqual([
      { kind: "section", text: "Verse" },
      { kind: "line", byLang: { en: "Line one" } },
      { kind: "line", byLang: { en: "Line two" } },
      { kind: "break" },
      { kind: "line", byLang: { en: "Line three" } },
      { kind: "section", text: "Chorus" },
      { kind: "line", byLang: { en: "Hallelujah" } },
    ]);
  });

  it("leaving Multilanguage keeps one language and hides the grid", () => {
    const slides = rowsToSlides(rows, ["en"]);
    const { text, hidden } = leaveMultilang({ slides, langs: ["en", "ja", "es"] }, "ja");
    expect(text).toBe("[Verse 1]\nおどろくばかりの\nめぐみなりき\n\n[Chorus]\nただ");
    expect(hidden.kept).toBe("ja");
    expect(hidden.langs).toEqual(["en", "ja", "es"]);
  });

  it("coming back refills the kept column from the plain words", () => {
    const slides = rowsToSlides(rows, ["en"]);
    const { hidden } = leaveMultilang({ slides, langs: ["en", "ja"] }, "en");
    const plain: Slide[] = [
      { id: "p", kind: "lyric", lines: ["Amazing grace!", "How sweet"], section: "Verse 1" },
      { id: "q", kind: "lyric", lines: ["Only"], section: "Chorus" },
    ];
    const back = returnToMultilang(hidden, plain);
    expect(back).toEqual([
      { kind: "section", text: "Verse 1" },
      {
        kind: "line",
        byLang: { en: "Amazing grace!", ja: "おどろくばかりの", es: "Sublime gracia" },
      },
      { kind: "line", byLang: { en: "How sweet", ja: "めぐみなりき" } },
      { kind: "section", text: "Chorus" },
      { kind: "line", byLang: { ja: "ただ", en: "Only" } },
    ]);
  });

  it("a section deleted in the plain editor stays deleted", () => {
    const slides = rowsToSlides(rows, ["en"]);
    const { hidden } = leaveMultilang({ slides, langs: ["en", "ja"] }, "en");
    const plain: Slide[] = [
      { id: "p", kind: "lyric", lines: ["Amazing grace", "How sweet the sound"] },
    ];
    const back = returnToMultilang(hidden, plain);
    expect(back.some((r) => r.kind === "section")).toBe(false);
    expect(back).toEqual([
      {
        kind: "line",
        byLang: { en: "Amazing grace", ja: "おどろくばかりの", es: "Sublime gracia" },
      },
      { kind: "line", byLang: { en: "How sweet the sound", ja: "めぐみなりき" } },
      { kind: "line", byLang: { ja: "ただ" } },
    ]);
  });
});

describe("slide breaks", () => {
  const two: MultiRow[] = [
    { kind: "line", byLang: { en: "One", ja: "いち" } },
    { kind: "line", byLang: { ja: "に" } },
    { kind: "line", byLang: { en: "Three", ja: "さん" } },
    { kind: "section", text: "Chorus" },
    { kind: "line", byLang: { en: "Four" } },
  ];
  const divided = divideRows(two, 2);

  it("Lines per slide puts a break every N lines of a section", () => {
    expect(divided.map((r) => r.kind)).toEqual([
      "line",
      "line",
      "break",
      "line",
      "section",
      "line",
    ]);
    expect(divideRows(divided, 1).filter((r) => r.kind === "break")).toHaveLength(2);
  });

  it("shows each language's lines in turn, slide by slide", () => {
    const slides = rowsToSlides(divided, ["en", "ja"]);
    expect(slides.map((s) => s.lines)).toEqual([
      ["One", "いち", "に"],
      ["Three", "さん"],
      ["Four"],
    ]);
    expect(slides[0].lineLangs).toEqual(["en", "ja", "ja"]);
    expect(slides[0].linesByLang).toEqual({ en: "One\n", ja: "いち\nに" });
  });

  it("a hand-placed break makes its own slide and round-trips", () => {
    const custom: MultiRow[] = [two[0], { kind: "break" }, two[1], two[2], two[3], two[4]];
    expect(rowsToSlides(custom, ["en"]).map((s) => s.lines)).toEqual([
      ["One"],
      ["Three"],
      ["Four"],
    ]);
    expect(slidesToRows(rowsToSlides(custom, ["en"]))).toEqual(custom);
    expect(sameDivision(custom, divided)).toBe(false);
    expect(sameDivision(divideRows(custom, 2), divided)).toBe(true);
  });

  it("numbers the slide on its first row", () => {
    expect(slideStarts(divided)).toEqual([1, null, null, 2, null, 3]);
  });

  it("breaks survive leaving and coming back", () => {
    const slides = rowsToSlides(divided, ["en", "ja"]);
    const { text, hidden } = leaveMultilang({ slides, langs: ["en", "ja"] }, "ja");
    expect(text).toBe("いち\nに\n---\nさん\n\n[Chorus]");
    const plain: Slide[] = [
      { id: "a", kind: "lyric", lines: ["いち"] },
      { id: "b", kind: "lyric", lines: ["に", "さん"] },
    ];
    const back = returnToMultilang(hidden, plain);
    expect(back.map((r) => r.kind)).toEqual(["line", "break", "line", "line", "line"]);
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
  it("stacks the phone's own languages in the order it picked them", () => {
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
    expect(phoneSetForLangs(set, ["es", "ja"]).slides[0].lines).toEqual(["Sublime", "おどろく"]);
    expect(phoneSetForLangs(set, undefined)).toBe(set);
  });
});

describe("Fast Edit on a Multilanguage slide", () => {
  it("writes each edited line back into its language", () => {
    const [slide] = rowsToSlides(divideRows(rows, 1), ["ja", "en"]);
    const patch = editedLangLines(slide, ["おどろく", "Amazing love"]);
    expect(patch.linesByLang).toEqual({ en: "Amazing love", ja: "おどろく", es: "Sublime gracia" });
    expect(editedLangLines({ id: "x", kind: "lyric", lines: ["a"] }, ["b"])).toEqual({
      lines: ["b"],
    });
  });
});
