import { describe, expect, it } from "vitest";
import { groupSlides, newSectionName } from "../sections";
import { addSection, sectionNames, toDoc, fromDoc } from "../response-grid";
import { addSectionRow, rowsToSlides, slidesToRows, type MultiRow } from "../multiling";
import { lyricsToSlides } from "../slide-text";

const groups = (slides: { section?: string }[]) => groupSlides(slides).map((g) => g.key);

describe("newSectionName", () => {
  it("is Section, numbered when taken", () => {
    expect(newSectionName([])).toBe("Section");
    expect(newSectionName(["Verse", "Chorus"])).toBe("Section");
    expect(newSectionName(["Section"])).toBe("Section 2");
    expect(newSectionName(["Section", "Section 2", "section 3"])).toBe("Section 4");
    expect(newSectionName(["Section 2"])).toBe("Section");
  });
});

describe("+ Section in Call and Response (bug report: slides didn't change)", () => {
  const lyrics = "[Verse]\nA\nB\n---\n[Chorus]\nC\nD";
  it("cursor on a Chorus line: the new section shows as its own group", () => {
    const d = toDoc(lyrics, []);
    const at = 6; // D
    const { doc, focus } = addSection(d, at, newSectionName(sectionNames(lyrics)), null);
    const next = fromDoc(doc).lyrics;
    expect(groups(lyricsToSlides(next))).toEqual(["Verse#0", "Chorus#0", "Section#0"]);
    expect(doc.lines[focus]).toBe("D");
  });
  it("no cursor: at the end, with an empty line for the caret", () => {
    const d = toDoc(lyrics, ["leader", "leader", null, null, "people", "people"] as never);
    const { doc, focus } = addSection(d, null, "Section", "people");
    expect(doc.lines.slice(-2)).toEqual(["[Section]", " "]);
    expect(doc.roles.slice(-2)).toEqual([null, "people"]);
    expect(focus).toBe(doc.lines.length - 1);
    // The slide appears once a word is typed.
    const typed = [...doc.lines];
    typed[focus] = "E";
    expect(groups(lyricsToSlides(typed.join("\n")))).toEqual(["Verse#0", "Chorus#0", "Section#0"]);
  });
});

describe("+ Section in Multi-Language (bug report: slides didn't change)", () => {
  const rows: MultiRow[] = [
    { kind: "section", text: "Chorus" },
    { kind: "line", byLang: { en: "a" } },
    { kind: "break" },
    { kind: "line", byLang: { en: "b" } },
  ];
  const names = rows.flatMap((r) => (r.kind === "section" ? [r.text] : []));
  it("cursor on a Chorus line: the new section shows as its own group", () => {
    const { rows: next, line } = addSectionRow(rows, 3, newSectionName(names));
    expect(groups(rowsToSlides(next, ["en"]))).toEqual(["Chorus#0", "Section#0"]);
    expect(line).toBe(1);
    // Round-trips through the stored slides.
    expect(groups(rowsToSlides(slidesToRows(rowsToSlides(next, ["en"])), ["en"]))).toEqual([
      "Chorus#0",
      "Section#0",
    ]);
  });
  it("no cursor: at the end, with an empty line for the caret", () => {
    const { rows: next, line } = addSectionRow(rows, null, "Section");
    expect(next.slice(-2)).toEqual([
      { kind: "section", text: "Section" },
      { kind: "line", byLang: {} },
    ]);
    expect(line).toBe(2);
  });
});
