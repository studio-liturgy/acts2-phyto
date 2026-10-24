import { describe, expect, it } from "vitest";
import { kindColorOf, matchesKindStep, nextKindFilter } from "../kind-filter";

const cycle = (color: "song" | "scripture" | "media", from = "all") => {
  const seen: string[] = [];
  let cur = from;
  for (let i = 0; i < 6; i++) {
    cur = nextKindFilter(cur, color);
    seen.push(cur);
    if (cur === "all") break;
  }
  return seen;
};

describe("nextKindFilter", () => {
  it("cycles blue through the song steps, then off", () => {
    expect(cycle("song")).toEqual([
      "song",
      "song-chords",
      "song-multilang",
      "song-response",
      "all",
    ]);
  });
  it("cycles green through scriptures and messages, then off", () => {
    expect(cycle("scripture")).toEqual(["scripture", "message", "all"]);
  });
  it("toggles orange", () => {
    expect(cycle("media")).toEqual(["media", "all"]);
  });
  it("starts another colour at its first step", () => {
    expect(nextKindFilter("song-multilang", "scripture")).toBe("scripture");
    expect(nextKindFilter("message", "song")).toBe("song");
    expect(nextKindFilter("personal", "media")).toBe("media");
  });
});

describe("matchesKindStep", () => {
  const song = { kind: "song" as const };
  const chords = { key: "G", display: "letters" } as never;
  it("song steps", () => {
    expect(matchesKindStep(song, "song")).toBe(true);
    expect(matchesKindStep(song, "song-chords")).toBe(false);
    expect(matchesKindStep({ ...song, chords }, "song-chords")).toBe(true);
    expect(
      matchesKindStep(
        { ...song, chords: { ...(chords as object), hidden: true } as never },
        "song-chords",
      ),
    ).toBe(false);
    expect(matchesKindStep({ ...song, songLayout: "multilang" }, "song-multilang")).toBe(true);
    expect(matchesKindStep({ ...song, songLayout: "response" }, "song-multilang")).toBe(false);
    expect(matchesKindStep({ ...song, songLayout: "response" }, "song-response")).toBe(true);
  });
  it("scripture includes messages; messages alone excludes scripture", () => {
    expect(matchesKindStep({ kind: "message" }, "scripture")).toBe(true);
    expect(matchesKindStep({ kind: "scripture" }, "message")).toBe(false);
    expect(matchesKindStep({ kind: "message" }, "message")).toBe(true);
  });
  it("kindColorOf", () => {
    expect(kindColorOf("song-response")).toBe("song");
    expect(kindColorOf("message")).toBe("scripture");
    expect(kindColorOf("all")).toBe(null);
  });
});
