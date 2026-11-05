import { describe, expect, it } from "vitest";
import { parseLyricsFromText, slidesToLyricsText } from "./slide-text";
import { groupSlides } from "./sections";
import { sectionOptions } from "./arrangements";
import { responseRows } from "./response-grid";
import { canTakeRole, plainSongSlides } from "./song-roles";
import { rowsToSlides, slidesToRows, standardToRows, type MultiRow } from "./multiling";

// A section whose name was cleared stays a section (only the bin removes
// one), and two unnamed sections side by side stay apart.
const TEXT = "[Verse]\nOne\n[]\nTwo\n[]\nThree";

describe("unnamed sections", () => {
  it("parse as their own sections in the text box", () => {
    const slides = parseLyricsFromText(TEXT);
    expect(slides.map((s) => s.section)).toEqual(["Verse", "", ""]);
    const groups = groupSlides(slides);
    expect(groups.map((g) => g.section)).toEqual(["Verse", "", ""]);
    expect(new Set(groups.map((g) => g.key)).size).toBe(3);
  });

  it("round-trip through the stored slides", () => {
    const text = slidesToLyricsText(parseLyricsFromText(TEXT));
    expect(text.split("\n").filter((l) => l === "[]")).toHaveLength(2);
    expect(groupSlides(parseLyricsFromText(text))).toHaveLength(3);
  });

  it("keep a break inside one unnamed section in one group", () => {
    const slides = parseLyricsFromText("[]\nOne\n---\nTwo\n[]\nThree");
    expect(groupSlides(slides).map((g) => g.items.length)).toEqual([2, 1]);
  });

  it("read as Section on pills and menus", () => {
    const opts = sectionOptions(parseLyricsFromText(TEXT));
    expect(opts.map((o) => o.label)).toEqual(["Verse", "Section (1)", "Section (2)"]);
    expect(sectionOptions(parseLyricsFromText("[]\nOne")).map((o) => o.label)).toEqual(["Section"]);
  });

  it("stay a section row in the Call and Response grid", () => {
    const rows = responseRows("[Verse]\nOne\n[]\nTwo");
    expect(rows.filter((r) => r.kind === "section").map((r) => r.text)).toEqual(["Verse", ""]);
    expect(canTakeRole("[]")).toBe(false);
    expect(plainSongSlides("[]\nOne\n[]\nTwo", [], true)).toHaveLength(2);
  });

  it("survive the Multi-Language grid", () => {
    const rows: MultiRow[] = [
      { kind: "section", text: "Verse" },
      { kind: "line", byLang: { en: "One" } },
      { kind: "section", text: "" },
      { kind: "line", byLang: { en: "Two" } },
      { kind: "section", text: "" },
      { kind: "line", byLang: { en: "Three" } },
    ];
    const slides = rowsToSlides(rows, ["en"]);
    expect(groupSlides(slides).map((g) => g.section)).toEqual(["Verse", "", ""]);
    expect(slidesToRows(slides).filter((r) => r.kind === "section")).toHaveLength(3);
    expect(
      standardToRows(parseLyricsFromText(TEXT), "en").filter((r) => r.kind === "section"),
    ).toHaveLength(3);
  });
});
