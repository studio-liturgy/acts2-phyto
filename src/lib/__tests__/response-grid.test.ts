import { describe, expect, it } from "vitest";
import {
  breakAfter,
  breakBefore,
  fromDoc,
  mergeIntoPrevious,
  moveLine,
  neighbourLine,
  responseRows,
  toDoc,
} from "@/lib/response-grid";

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

  it("Cmd+Enter: a break after the line, and an empty line for the cursor", () => {
    const doc = toDoc("A\nB", ["leader", "people"]);
    const one = breakAfter(doc, 0, "leader");
    expect(fromDoc(one.doc).lyrics).toBe("A\n---\nB");
    expect(one.focus).toBe(2);
    const end = breakAfter(doc, 1, "people");
    expect(fromDoc(end.doc).lyrics).toBe("A\nB\n---\n ");
    expect(end.doc.roles).toEqual(["leader", "people", null, "people"]);
    expect(end.focus).toBe(3);
  });

  it("an empty new line shows as a row; + Line works", () => {
    expect(responseRows("A\n ").map((r) => r.kind)).toEqual(["line", "line"]);
    expect(responseRows("A\n\nB").map((r) => r.kind)).toEqual(["line", "line"]);
  });

  it("sections take the slide panel's group colours", () => {
    const rows = responseRows("Intro line\n[Verse]\nA\n[Chorus]\nB");
    expect(rows.flatMap((r) => (r.kind === "section" ? [r.group] : []))).toEqual([1, 2]);
    expect(
      responseRows("[Verse]\nA\n[Chorus]\nB").flatMap((r) =>
        r.kind === "section" ? [r.group] : [],
      ),
    ).toEqual([0, 1]);
  });

  it("drags a break or section to sit before another line", () => {
    const doc = toDoc("A\n---\nB\nC", ["leader", null, "people", "leader"]);
    const moved = moveLine(doc, 1, 3);
    expect(fromDoc(moved).lyrics).toBe("A\nB\n---\nC");
    expect(moved.roles).toEqual(["leader", "people", null, "leader"]);
    expect(fromDoc(moveLine(doc, 1, 0)).lyrics).toBe("---\nA\nB\nC");
  });

  it("Backspace at a line's start joins it onto the line above", () => {
    const doc = toDoc("(G)Amazing grace\n---\nhow sweet\n[Chorus]\nOnly", [
      "leader",
      null,
      "people",
      null,
      "leader",
    ]);
    const strip = (l: string) => l.replace(/\([^)]*\)/g, "");
    const m = mergeIntoPrevious(doc, 2, strip)!;
    expect(fromDoc(m.doc).lyrics).toBe("(G)Amazing gracehow sweet\n---\n[Chorus]\nOnly");
    expect(m.doc.roles[0]).toBe("leader");
    expect(m).toMatchObject({ focus: 0, caret: 13 });
    // Not across a section, nor at the top.
    expect(mergeIntoPrevious(doc, 4, strip)).toBeNull();
    expect(mergeIntoPrevious(doc, 0, strip)).toBeNull();
  });
});
