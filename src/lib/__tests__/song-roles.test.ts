import { describe, expect, it } from "vitest";
import { setChordAt, splitChordLine } from "@/lib/chords";
import { lyricsToSlides } from "@/lib/slide-text";
import {
  attachRoles,
  nextRole,
  remapRoles,
  startsRoleRun,
  rolesFromSlides,
  type LineRoles,
} from "@/lib/song-roles";
import { songPatternStyle, songPatterns } from "@/lib/song-layout";
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

  it("bakes Show role and Align onto slides with roles", () => {
    const slides = attachRoles(lyricsToSlides(text), text, roles, true, {
      marks: true,
      align: "split",
    });
    expect(slides[0].roleMarks).toBe(true);
    expect(slides[0].roleAlign).toBe("split");
    const hidden = attachRoles(lyricsToSlides(text), text, roles, false, { marks: true });
    expect(hidden[0].roleMarks).toBeUndefined();
  });

  it("marks only the first line of each reader's run", () => {
    const r = ["leader", "leader", "people", "people", "leader"] as const;
    expect(r.map((_, i) => startsRoleRun(r, i))).toEqual([true, false, true, false, true]);
  });

  it("a re-divide (slide breaks added) leaves every role on its line", () => {
    const flat = "The Lord be with you\nAnd also with you\nLift up your hearts";
    const r: LineRoles = ["leader", "people", "leader"];
    const divided = "The Lord be with you\nAnd also with you\n---\nLift up your hearts";
    expect(remapRoles(flat, divided, r)).toEqual(["leader", "people", null, "leader"]);
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
});

describe("chord strip edits", () => {
  it("sets, replaces and removes a chord over a word", () => {
    expect(setChordAt("Amazing grace", 8, "G")).toBe("Amazing (G)grace");
    expect(setChordAt("Amazing (G)grace", 8, "C")).toBe("Amazing (C)grace");
    expect(setChordAt("Amazing (G)grace", 8, null)).toBe("Amazing grace");
    expect(setChordAt("Amazing", 99, "D")).toBe("Amazing(D)");
  });

  it("Enter splits a line, each chord going with its word", () => {
    expect(splitChordLine("(G)Amazing (C)grace how (D)sweet", 14)).toEqual([
      "(G)Amazing (C)grace ",
      "how (D)sweet",
    ]);
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

  it("chords are dots (sized), modes are stripes, no layer twice", () => {
    const dots = songPatternStyle(["lines"], 6);
    expect(dots.backgroundImage).toContain("radial-gradient");
    expect(dots.backgroundSize).toBe("6px 6px");
    const grid = songPatternStyle(["lines", "grid"], 6);
    expect(grid.backgroundImage!.match(/\(0deg/g)).toHaveLength(1);
    expect(grid.backgroundSize).toBe("6px 6px, auto, auto");
    expect(songPatternStyle([], 6)).toEqual({});
  });
});
