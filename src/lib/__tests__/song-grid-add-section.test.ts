import { describe, expect, it } from "vitest";
import { groupSlides } from "../sections";
import { addSection, toDoc, fromDoc } from "../response-grid";
import { addSectionRow, rowsToSlides, slidesToRows, type MultiRow } from "../multiling";
import { lyricsToSlides } from "../slide-text";

const groups = (slides: { section?: string; sectionStart?: boolean }[]) =>
  groupSlides(slides).map((g) => g.section);

// + Section adds a section with no name (the faint SECTION placeholder shows
// until one is typed). It must still be its own group on the slides, even
// next to another unnamed section.

describe("+ Section in Call and Response", () => {
  const lyrics = "[Verse]\nA\nB\n---\n[]\nC\nD";
  it("cursor on a line of an unnamed section: the new one shows as its own group", () => {
    const d = toDoc(lyrics, []);
    const at = 6; // D
    const { doc, focus } = addSection(d, at, "", null);
    const next = fromDoc(doc).lyrics;
    expect(groups(lyricsToSlides(next))).toEqual(["Verse", "", ""]);
    expect(new Set(groupSlides(lyricsToSlides(next)).map((g) => g.key)).size).toBe(3);
    expect(doc.lines[focus]).toBe("D");
  });
  it("no cursor: at the end, with an empty line for the caret", () => {
    const d = toDoc(lyrics, ["leader", "leader", null, null, null, "people", "people"] as never);
    const { doc, focus } = addSection(d, null, "", "people");
    expect(doc.lines.slice(-2)).toEqual(["[]", " "]);
    expect(doc.roles.slice(-2)).toEqual([null, "people"]);
    expect(focus).toBe(doc.lines.length - 1);
    // The slide appears once a word is typed.
    const typed = [...doc.lines];
    typed[focus] = "E";
    expect(groups(lyricsToSlides(typed.join("\n")))).toEqual(["Verse", "", ""]);
  });
});

describe("+ Section in Multi-Language", () => {
  const rows: MultiRow[] = [
    { kind: "section", text: "" },
    { kind: "line", byLang: { en: "a" } },
    { kind: "break" },
    { kind: "line", byLang: { en: "b" } },
  ];
  it("cursor on a line of an unnamed section: the new one shows as its own group", () => {
    const { rows: next, line } = addSectionRow(rows, 3, "");
    expect(groupSlides(rowsToSlides(next, ["en"]))).toHaveLength(2);
    expect(line).toBe(1);
    // Round-trips through the stored slides.
    expect(
      groupSlides(rowsToSlides(slidesToRows(rowsToSlides(next, ["en"])), ["en"])),
    ).toHaveLength(2);
  });
  it("no cursor: at the end, with an empty line for the caret", () => {
    const { rows: next, line } = addSectionRow(rows, null, "");
    expect(next.slice(-2)).toEqual([
      { kind: "section", text: "" },
      { kind: "line", byLang: {} },
    ]);
    expect(line).toBe(2);
  });
});
