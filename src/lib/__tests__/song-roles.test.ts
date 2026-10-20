import { describe, expect, it } from "vitest";
import { chordRowLayout, hideChords, inlineToChordRows } from "@/lib/chords";
import {
  canTakeRole,
  roleGutterRows,
  cycleLineRole,
  nextRole,
  splitRole,
  withRole,
} from "@/lib/song-roles";
import { songPatternImage, songPatterns } from "@/lib/song-layout";

describe("song roles", () => {
  it("reads a role label off the start of a line", () => {
    expect(splitRole("People: Thanks be to God")).toEqual({
      role: "people",
      text: "Thanks be to God",
    });
    expect(splitRole("Leader:The Lord be with you")).toEqual({
      role: "leader",
      text: "The Lord be with you",
    });
    expect(splitRole("All of my days")).toEqual({ text: "All of my days" });
    expect(splitRole("people: lower case is lyric text")).toEqual({
      text: "people: lower case is lyric text",
    });
  });

  it("replaces or removes a role", () => {
    expect(withRole("Leader: Lift up your hearts", "people")).toBe("People: Lift up your hearts");
    expect(withRole("All: Amen", undefined)).toBe("Amen");
    expect(withRole("Amen", "all")).toBe("All: Amen");
  });

  it("cycles none, Leader, People, All, none", () => {
    const seen: (string | undefined)[] = [];
    let r = nextRole(undefined);
    for (let i = 0; i < 4; i++) {
      seen.push(r);
      r = nextRole(r);
    }
    expect(seen).toEqual(["leader", "people", "all", undefined]);
  });

  it("only cycles lyric lines, leaving breaks and labels alone", () => {
    const lyrics = "[Call]\nThe Lord be with you\n---\n\nAnd also with you";
    expect(canTakeRole("[Call]")).toBe(false);
    expect(canTakeRole("---")).toBe(false);
    expect(canTakeRole("  ")).toBe(false);
    expect(cycleLineRole(lyrics, 0)).toBe(lyrics);
    expect(cycleLineRole(lyrics, 2)).toBe(lyrics);
    const once = cycleLineRole(lyrics, 1);
    expect(once.split("\n")[1]).toBe("Leader: The Lord be with you");
    expect(cycleLineRole(cycleLineRole(once, 1), 1).split("\n")[1]).toBe(
      "All: The Lord be with you",
    );
  });
});

describe("song patterns", () => {
  const song = { kind: "song" as const };
  it("maps layouts and chords to patterns", () => {
    expect(songPatterns(song)).toEqual([]);
    expect(songPatterns({ ...song, chords: { key: "G", display: "letters" } })).toEqual(["lines"]);
    expect(
      songPatterns({ ...song, chords: { key: "G", display: "letters", hidden: true } }),
    ).toEqual([]);
    expect(songPatterns({ ...song, songLayout: "multilang" })).toEqual(["grid"]);
    expect(
      songPatterns({
        ...song,
        songLayout: "response",
        chords: { key: "G", display: "letters" },
      }),
    ).toEqual(["lines", "hatch"]);
    expect(songPatterns({ kind: "scripture", songLayout: "response" })).toEqual([]);
  });

  it("never repeats a layer (lines under a grid)", () => {
    const img = songPatternImage(["lines", "grid"], 6)!;
    expect(img.match(/\(0deg/g)).toHaveLength(1);
    expect(img).toContain("90deg");
    expect(songPatternImage([], 6)).toBeUndefined();
  });
});

describe("role gutter rows", () => {
  const lyrics =
    "[Call]\nLeader: The (G)Lord be with you\nPeople: And also with you\n---\n(G) (C)\nAmen";

  it("chords hidden: one toggle per lyric line, box lines match stored lines", () => {
    const box = hideChords(lyrics);
    expect(roleGutterRows(lyrics, box, null)).toEqual([
      { boxLine: 1, storedLine: 1, role: "leader" },
      { boxLine: 2, storedLine: 2, role: "people" },
      { boxLine: 5, storedLine: 5, role: undefined },
    ]);
  });

  it("chords shown: the toggle sits on the lyric under its chord row", () => {
    const box = inlineToChordRows(lyrics);
    const rows = roleGutterRows(lyrics, box, chordRowLayout(lyrics));
    const boxLines = box.split("\n");
    expect(rows.map((r) => r.storedLine)).toEqual([1, 2, 5]);
    expect(boxLines[rows[0].boxLine]).toContain("Leader: The");
    expect(boxLines[rows[2].boxLine]).toBe("Amen");
  });
});
