import { describe, expect, it } from "vitest";
import { breakBefore, responseRows, toDoc, fromDoc, neighbourLine } from "@/lib/response-grid";

const lyrics =
  "[Call]\nThe Lord be with you\nAnd also with you\n---\nLift up your hearts\n\nWe lift them";

describe("Call and Response grid rows", () => {
  it("one row per stored line: sections, breaks, lines numbered per slide", () => {
    const rows = responseRows(lyrics);
    expect(rows.map((r) => r.kind)).toEqual(["section", "line", "line", "break", "line", "line"]);
    expect(rows.filter((r) => r.kind === "line").map((r) => (r.kind === "line" ? r.n : 0))).toEqual(
      [1, 2, 1, 2],
    );
  });

  it("breaks above a line once, roles moving with their lines", () => {
    const doc = toDoc(lyrics, [null, "leader", "people", null, "leader", null, "people"]);
    const split = breakBefore(doc, 2);
    expect(fromDoc(split).lyrics.split("\n").slice(0, 4)).toEqual([
      "[Call]",
      "The Lord be with you",
      "---",
      "And also with you",
    ]);
    expect(split.roles.slice(0, 4)).toEqual([null, "leader", null, "people"]);
    // Already a break above line 4: nothing added.
    expect(breakBefore(doc, 4)).toBe(doc);
  });

  it("steps between lyric lines, skipping breaks and blanks", () => {
    expect(neighbourLine(lyrics, 4, -1)).toBe(2);
    expect(neighbourLine(lyrics, 4, 1)).toBe(6);
    expect(neighbourLine(lyrics, 1, -1)).toBe(-1);
  });
});
