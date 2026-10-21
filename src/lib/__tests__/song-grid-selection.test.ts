import { describe, expect, it } from "vitest";
import {
  lineSelectionText,
  pasteOverLines,
  removeLyricLines,
  toDoc,
  fromDoc,
  type Doc,
} from "../response-grid";
import { columnRangeText, type MultiRow } from "../multiling";

const doc = (text: string, roles: (string | null)[]): Doc => toDoc(text, roles as never);

// 0 [Verse]  1 (G)A  2 B  3 ---  4 (C)C  5 [Chorus]  6 D  7 E
const LYRICS = "[Verse]\n(G)A\nB\n---\n(C)C\n[Chorus]\nD\nE";
const ROLES = [null, "leader", "people", null, "leader", null, "people", "leader"];

describe("C+R drag selection: copy", () => {
  it("copies only lyric lines in the range, sections and breaks skipped", () => {
    expect(lineSelectionText(doc(LYRICS, ROLES), 1, 6, true)).toBe("(G)A\nB\n(C)C\nD");
  });
  it("leaves the chords out when Chords is off", () => {
    expect(lineSelectionText(doc(LYRICS, ROLES), 1, 6, false)).toBe("A\nB\nC\nD");
  });
  it("an empty new line copies as an empty line", () => {
    expect(lineSelectionText(doc("A\n \nB", [null, null, null]), 0, 2, true)).toBe("A\n\nB");
  });
});

describe("C+R drag selection: cut / delete", () => {
  it("removes the lyric lines and their roles, keeps sections, tidies breaks", () => {
    const out = removeLyricLines(doc(LYRICS, ROLES), 2, 4);
    expect(fromDoc(out).lyrics).toBe("[Verse]\n(G)A\n[Chorus]\nD\nE");
    expect(out.roles).toEqual([null, "leader", null, "people", "leader"]);
  });
  it("never leaves the song without a line", () => {
    const out = removeLyricLines(doc("A\nB", ["leader", "people"]), 0, 1);
    expect(out.lines).toEqual([" "]);
    expect(out.roles).toEqual(["leader"]);
  });
});

describe("C+R drag selection: paste", () => {
  it("replaces the selected lines in order, each keeping its role", () => {
    const out = pasteOverLines(doc(LYRICS, ROLES), 1, 4, ["x", "y", "z"]);
    expect(fromDoc(out.doc).lyrics).toBe("[Verse]\nx\ny\n---\nz\n[Chorus]\nD\nE");
    expect(out.doc.roles).toEqual(ROLES);
  });
  it("extra lines go after the last selected line with its role", () => {
    const out = pasteOverLines(doc(LYRICS, ROLES), 6, 7, ["p", "q", "r", "s"]);
    expect(fromDoc(out.doc).lyrics).toBe("[Verse]\n(G)A\nB\n---\n(C)C\n[Chorus]\np\nq\nr\ns");
    expect(out.doc.roles.slice(6)).toEqual(["people", "leader", "leader", "leader"]);
    expect(out.focus).toBe(9);
  });
  it("selected lines the paste doesn't reach are removed", () => {
    const out = pasteOverLines(doc(LYRICS, ROLES), 1, 7, ["x", "y"]);
    expect(fromDoc(out.doc).lyrics).toBe("[Verse]\nx\ny\n[Chorus]");
    expect(out.focus).toBe(2);
  });
});

describe("Multi-Language column copy", () => {
  const rows: MultiRow[] = [
    { kind: "line", byLang: { en: "(G)Amazing grace", es: "Sublime gracia" } },
    { kind: "section", text: "Chorus" },
    { kind: "line", byLang: { en: "how (D)sweet" } },
  ];
  it("keeps chords when Chords is on", () => {
    expect(columnRangeText(rows, "en", 0, 2, true)).toBe("(G)Amazing grace\nhow (D)sweet");
  });
  it("leaves the chords out when Chords is off", () => {
    expect(columnRangeText(rows, "en", 0, 2, false)).toBe("Amazing grace\nhow sweet");
  });
});
