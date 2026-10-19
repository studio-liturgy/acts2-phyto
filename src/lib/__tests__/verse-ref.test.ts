import { describe, expect, it } from "vitest";
import {
  assignVerses,
  fillRowVerses,
  fillSlideVerses,
  parseVerseTag,
  passageBook,
  perSlideReference,
  rowPassagesMissingVerses,
  shownReference,
  slidePassagesMissingVerses,
  spanRanges,
  verseRange,
  withRefPerSlide,
} from "../verse-ref";
import {
  fromVerseRows,
  mergeRowsUp,
  parseScriptureFromText,
  slidesToScriptureText,
  slidesToVersionText,
  toVerseRows,
  versionTextToSlides,
} from "../slide-text";
import { displayLinesForVersions } from "../versions";
import type { Slide } from "../types";

const v = (chapter: number, verse: number, text = "x") => ({ chapter, verse, text });

describe("verse ranges", () => {
  it("formats one verse, a run in a chapter, and a run across chapters", () => {
    expect(verseRange([v(1, 1)])).toBe("1:1");
    expect(verseRange([v(1, 1), v(1, 2)])).toBe("1:1-2");
    expect(verseRange([v(3, 36), v(4, 1)])).toBe("3:36-4:1");
    expect(verseRange([])).toBeUndefined();
  });

  it("spans two slides' verses from the first's start to the second's end", () => {
    expect(spanRanges("1:1", "1:2")).toBe("1:1-2");
    expect(spanRanges("1:1-2", "1:3")).toBe("1:1-3");
    expect(spanRanges("3:36", "4:1-2")).toBe("3:36-4:2");
    expect(spanRanges(undefined, "1:2")).toBe("1:2");
    expect(spanRanges("1:1", undefined)).toBe("1:1");
  });

  it("reads verse tag lines and nothing else", () => {
    expect(parseVerseTag("{1:1}")).toBe("1:1");
    expect(parseVerseTag("  {3:36-4:1} ")).toBe("3:36-4:1");
    expect(parseVerseTag("{God so loved}")).toBeNull();
    expect(parseVerseTag("[John 1]")).toBeNull();
  });
});

describe("the reference a slide shows", () => {
  it("finds the book in plain, numbered and Chinese references", () => {
    expect(passageBook("John 1")).toBe("John");
    expect(passageBook("1 John 3:1-2")).toBe("1 John");
    expect(passageBook("約翰福音 1")).toBe("約翰福音");
    expect(passageBook("Psalm 119:1-4:2")).toBe("Psalm");
  });

  it("narrows the passage to the slide's verses, keeping the version label", () => {
    expect(perSlideReference("John 1", "1:1")).toBe("John 1:1");
    expect(perSlideReference("John 1", "1:1-2")).toBe("John 1:1-2");
    expect(perSlideReference("John 1 NIV", "1:3")).toBe("John 1:3 NIV");
    expect(perSlideReference("John 3:21-4:2", "3:36-4:1")).toBe("John 3:36-4:1");
  });

  it("shows the passage unless the slide is marked and knows its verses", () => {
    expect(shownReference("John 1", { verses: "1:2" })).toBe("John 1");
    expect(shownReference("John 1", { refPerSlide: true })).toBe("John 1");
    expect(shownReference("John 1", { verses: "1:2", refPerSlide: true })).toBe("John 1:2");
    expect(shownReference("Notes", { verses: "1:2", refPerSlide: true, manual: true })).toBe(
      "Notes",
    );
  });

  it("gives each stacked version its own book name with the slide's verses", () => {
    const slide: Slide = {
      id: "a",
      kind: "scripture",
      reference: "John 1 NIV",
      lines: ["In the beginning"],
      linesByVersion: { NIV: "In the beginning", CUNP: "太初有道" },
      referencesByVersion: { NIV: "John 1 NIV", CUNP: "約翰福音 1" },
      verses: "1:1",
      refPerSlide: true,
    };
    expect(displayLinesForVersions(slide, ["NIV", "CUNP"]).map((l) => l.reference)).toEqual([
      "John 1:1 NIV",
      "約翰福音 1:1",
    ]);
  });

  it("marks and unmarks a slide without touching anything else", () => {
    const s: Slide = { id: "a", kind: "scripture", lines: ["x"], verses: "1:1" };
    expect(withRefPerSlide(s, true)).toEqual({ ...s, refPerSlide: true });
    expect(withRefPerSlide({ ...s, refPerSlide: true }, false)).toEqual(s);
  });
});

describe("verse tags in the scripture text boxes", () => {
  const box = ["[John 1 NIV]", "{1:1}", "In the beginning", "---", "{1:2}", "He was with God"].join(
    "\n",
  );

  it("never show up as verse text, and carry the verses onto the slides", () => {
    const slides = parseScriptureFromText(box, 1);
    expect(slides.map((s) => s.lines)).toEqual([["In the beginning"], ["He was with God"]]);
    expect(slides.map((s) => s.verses)).toEqual(["1:1", "1:2"]);
    expect(slides.map((s) => s.reference)).toEqual(["John 1 NIV", "John 1 NIV"]);
    expect(slides.every((s) => !s.refPerSlide)).toBe(true);
    expect(slides.map((s) => s.importIndex)).toEqual([0, 0]);
  });

  it("mark the slides when the set shows a reference per slide", () => {
    const slides = parseScriptureFromText(box, 1, { refPerSlide: true });
    expect(slides.map((s) => shownReference(s.reference, s))).toEqual([
      "John 1:1 NIV",
      "John 1:2 NIV",
    ]);
  });

  it("survive the slides -> text -> slides round-trip (legacy and per-version boxes)", () => {
    const slides = parseScriptureFromText(box, 1);
    const again = parseScriptureFromText(slidesToScriptureText(slides), 1);
    expect(again.map((s) => [s.lines, s.verses])).toEqual(slides.map((s) => [s.lines, s.verses]));

    const two = { NIV: box, CUNP: box.replace("[John 1 NIV]", "[約翰福音 1]") };
    const vSlides = versionTextToSlides(two, ["NIV", "CUNP"], { refPerSlide: true });
    expect(vSlides.map((s) => s.verses)).toEqual(["1:1", "1:2"]);
    const back = versionTextToSlides(slidesToVersionText(vSlides, ["NIV", "CUNP"]), [
      "NIV",
      "CUNP",
    ]);
    expect(back.map((s) => s.verses)).toEqual(["1:1", "1:2"]);
    expect(back.map((s) => s.linesByVersion)).toEqual(vSlides.map((s) => s.linesByVersion));
  });

  it("ride through the verse editor's rows, joins and splits", () => {
    const rows = toVerseRows({ _: box }, ["_"]);
    expect(rows.map((r) => r.verses)).toEqual(["1:1", "1:2"]);
    expect(fromVerseRows(rows, ["_"])._).toBe(box);
    // Joining verse 2 onto verse 1 holds both.
    const joined = mergeRowsUp(rows, 1, ["_"]);
    expect(joined?.map((r) => [r.text._, r.verses])).toEqual([
      ["In the beginning He was with God", "1:1-2"],
    ]);
  });

  it("are left off hand-typed verses", () => {
    const manual = "[~My notes]\n{1:1}\nSomething";
    const [slide] = parseScriptureFromText(manual, 1, { refPerSlide: true });
    expect(slide.verses).toBeUndefined();
    expect(slide.refPerSlide).toBeUndefined();
  });
});

describe("matching blocks to a passage fetched again", () => {
  const passage = [
    v(1, 1, "In the beginning was the Word"),
    v(1, 2, "He was with God in the beginning"),
    v(1, 3, "Through him all things were made"),
  ];

  it("is exact for an untouched import, one or two verses a slide", () => {
    expect(
      assignVerses(
        passage.map((p) => p.text),
        passage,
      ),
    ).toEqual(["1:1", "1:2", "1:3"]);
    expect(
      assignVerses([`${passage[0].text} ${passage[1].text}`, passage[2].text], passage),
    ).toEqual(["1:1-2", "1:3"]);
  });

  it("follows joins, splits and small edits", () => {
    // Verse 1 split in two, verse 2 and 3 joined, a word changed.
    expect(
      assignVerses(
        [
          "In the beginning",
          "was the Word",
          "He was with God at the start. Through him all things were made",
        ],
        passage,
      ),
    ).toEqual(["1:1", "1:1", "1:2-3"]);
  });

  it("fills the verse editor's rows for imports that don't know their verses", () => {
    const old =
      "[John 1 NIV]\nIn the beginning was the Word\n---\nHe was with God in the beginning";
    const rows = toVerseRows({ NIV: old }, ["NIV"]);
    expect(rowPassagesMissingVerses(rows, "NIV")).toEqual(["John 1 NIV"]);
    const filled = fillRowVerses(rows, "NIV", new Map([["John 1 NIV", passage.slice(0, 2)]]));
    expect(filled.map((r) => [r.text.NIV, r.verses])).toEqual([
      ["In the beginning was the Word", "1:1"],
      ["He was with God in the beginning", "1:2"],
    ]);
    expect(rowPassagesMissingVerses(filled, "NIV")).toEqual([]);
  });

  it("fills a message's verse blocks, leaving points and hand-typed verses alone", () => {
    const s = (id: string, text: string, extra: Partial<Slide> = {}): Slide => ({
      id,
      kind: "scripture",
      reference: "John 1",
      lines: [text],
      importIndex: 0,
      ...extra,
    });
    const slides: Slide[] = [
      s("a", passage[0].text),
      s("b", passage[1].text),
      { id: "p", kind: "point", lines: ["Grace"] },
      s("m", "My own words", { manual: true, importIndex: 1 }),
    ];
    expect(slidePassagesMissingVerses(slides)).toEqual(["John 1"]);
    const filled = fillSlideVerses(slides, "NIV", new Map([["John 1", passage.slice(0, 2)]]));
    expect(filled.map((x) => x.verses)).toEqual(["1:1", "1:2", undefined, undefined]);
    expect(filled.map((x) => x.lines)).toEqual(slides.map((x) => x.lines));
  });
});
