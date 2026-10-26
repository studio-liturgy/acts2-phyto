import { describe, expect, it } from "vitest";
import { applyDividers } from "@/lib/apply-dividers";
import { divideRows, leaveMultilang, rowsToSlides, type MultiRow } from "@/lib/multiling";
import { plainSongSlides } from "@/lib/song-roles";

// Multi-Language to Call and Response: the slides written with the new mode
// are already the kept language at Lines per slide, never the grid's one row
// per slide in the first language.
describe("leaving Multi-Language for Call and Response", () => {
  const rows: MultiRow[] = [
    { kind: "section", text: "Verse 1" },
    { kind: "line", byLang: { en: "Amazing grace", ja: "おどろくばかりの" } },
    { kind: "line", byLang: { en: "How sweet the sound", ja: "めぐみなりき" } },
    { kind: "line", byLang: { en: "That saved a wretch", ja: "この身の汚れを" } },
    { kind: "line", byLang: { en: "Like me", ja: "知れるわれに" } },
  ];
  const slides = rowsToSlides(divideRows(rows, 1), ["en", "ja"]);

  it("builds the kept language's slides at Lines per slide", () => {
    const { text } = leaveMultilang({ slides, langs: ["en", "ja"] }, "ja");
    const divided = applyDividers(text, 2);
    const out = plainSongSlides(divided, [], true);
    expect(out.map((s) => s.lines)).toEqual([
      ["おどろくばかりの", "めぐみなりき"],
      ["この身の汚れを", "知れるわれに"],
    ]);
    expect(out.every((s) => s.section === "Verse 1")).toBe(true);
  });

  it("puts roles on as roles in Call and Response", () => {
    const { text } = leaveMultilang({ slides, langs: ["en", "ja"] }, "en");
    const divided = applyDividers(text, 2);
    const lines = divided.split("\n");
    const roles = lines.map((l) =>
      l === "Amazing grace" ? "leader" : l === "Like me" ? "people" : null,
    );
    const out = plainSongSlides(divided, roles, true);
    expect(out[0].roles).toEqual(["leader", null]);
    expect(out[1].roles).toEqual([null, "people"]);
    expect(out[0].hiddenRoles).toBeUndefined();
  });

  it("an empty box makes no slides", () => {
    expect(plainSongSlides("  ", [], true)).toEqual([]);
  });
});
