import { describe, expect, it } from "vitest";
import { chordRowLayout, inlineToChordRows, setChordAt } from "@/lib/chords";
import { lyricsToSlides } from "@/lib/slide-text";
import {
  attachRoles,
  nextRole,
  remapRoles,
  roleGutterRows,
  rolesFromSlides,
  type LineRoles,
} from "@/lib/song-roles";
import { songPatternImage, songPatterns } from "@/lib/song-layout";
import { wordStartAt } from "@/lib/grid-chord-bus";

const text = "[Call]\nThe Lord be with you\nAnd also with you\n---\nLift up your hearts";
const roles: LineRoles = [null, "leader", "people", null, "leader"];

describe("song roles", () => {
  it("cycles none, Leader, People, none", () => {
    const seen: (string | null)[] = [];
    let r = nextRole(null);
    for (let i = 0; i < 3; i++) {
      seen.push(r);
      r = nextRole(r);
    }
    expect(seen).toEqual(["leader", "people", null]);
  });

  it("bakes Hide Role and Align L/R onto slides with roles", () => {
    const slides = attachRoles(lyricsToSlides(text), text, roles, true, {
      hideNames: true,
      sides: true,
    });
    expect(slides[0].hideRoleNames).toBe(true);
    expect(slides[0].roleSides).toBe(true);
    const hidden = attachRoles(lyricsToSlides(text), text, roles, false, { hideNames: true });
    expect(hidden[0].hideRoleNames).toBeUndefined();
  });

  it("puts roles beside the words, never in them", () => {
    const slides = attachRoles(lyricsToSlides(text), text, roles, true);
    expect(slides[0].lines).toEqual(["The Lord be with you", "And also with you"]);
    expect(slides[0].roles).toEqual(["leader", "people"]);
    expect(slides[1].roles).toEqual(["leader"]);
  });

  it("out of Call and Response the roles are kept hidden, and come back", () => {
    const hidden = attachRoles(lyricsToSlides(text), text, roles, false);
    expect(hidden[0].roles).toBeUndefined();
    expect(hidden[0].hiddenRoles).toEqual(["leader", "people"]);
    expect(rolesFromSlides(text, hidden)).toEqual(roles);
  });

  it("carries roles through an edit", () => {
    // Typing in a line keeps its role.
    const typed = text.replace("hearts", "hearts!");
    expect(remapRoles(text, typed, roles)).toEqual(roles);
    // Enter at the end of the People line: the new line is People too.
    const split = text.replace("And also with you", "And also\nwith you");
    expect(remapRoles(text, split, roles)).toEqual([
      null,
      "leader",
      "people",
      "people",
      null,
      "leader",
    ]);
    // Deleting the Leader line keeps the rest where they are.
    const cut = text.replace("The Lord be with you\n", "");
    expect(remapRoles(text, cut, roles)).toEqual([null, "people", null, "leader"]);
  });

  it("gutter rows: one per lyric line, on the lyric under a chord row", () => {
    const withChord = text.replace("Lift up", "(G)Lift up");
    expect(roleGutterRows(withChord, roles, null).map((r) => r.storedLine)).toEqual([1, 2, 4]);
    const box = inlineToChordRows(withChord).split("\n");
    const rows = roleGutterRows(withChord, roles, chordRowLayout(withChord));
    expect(box[rows[2].boxLine]).toBe("Lift up your hearts");
    expect(rows[2].role).toBe("leader");
  });
});

describe("chord strip edits", () => {
  it("sets, replaces and removes a chord over a word", () => {
    expect(setChordAt("Amazing grace", 8, "G")).toBe("Amazing (G)grace");
    expect(setChordAt("Amazing (G)grace", 8, "C")).toBe("Amazing (C)grace");
    expect(setChordAt("Amazing (G)grace", 8, null)).toBe("Amazing grace");
    expect(setChordAt("Amazing", 99, "D")).toBe("Amazing(D)");
  });

  it("a palette chord lands on the word the caret is in", () => {
    expect(wordStartAt("Amazing grace", 10)).toBe(8);
    expect(wordStartAt("Amazing grace", 8)).toBe(8);
    expect(wordStartAt("Amazing grace", 13)).toBe(8);
    expect(wordStartAt("Amazing grace", 0)).toBe(0);
  });
});

describe("song patterns", () => {
  const song = { kind: "song" as const, songLayout: undefined, chords: undefined };
  it("maps modes and chords to patterns", () => {
    expect(songPatterns(song)).toEqual([]);
    expect(songPatterns({ ...song, chords: { key: "G", display: "letters" } })).toEqual(["lines"]);
    expect(
      songPatterns({ ...song, chords: { key: "G", display: "letters", hidden: true } }),
    ).toEqual([]);
    expect(songPatterns({ ...song, songLayout: "multilang" })).toEqual(["grid"]);
    expect(
      songPatterns({ ...song, songLayout: "response", chords: { key: "G", display: "letters" } }),
    ).toEqual(["lines", "hatch"]);
    expect(songPatterns({ ...song, kind: "scripture", songLayout: "response" })).toEqual([]);
  });

  it("never repeats a layer (lines under a grid)", () => {
    const img = songPatternImage(["lines", "grid"], 6)!;
    expect(img.match(/\(0deg/g)).toHaveLength(1);
    expect(img).toContain("90deg");
    expect(songPatternImage([], 6)).toBeUndefined();
  });
});
