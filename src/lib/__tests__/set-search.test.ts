import { describe, expect, it } from "vitest";
import { setMatchesSearch } from "../set-search";

const song = {
  name: "How Great Is Our God",
  slides: [{ lines: ["The (G)splendor of a King", "Clothed in majesty"] }, { lines: [] }],
};

describe("setMatchesSearch", () => {
  it("matches the name", () => {
    expect(setMatchesSearch(song, "great")).toBe(true);
  });
  it("matches words in the lyrics, with chords left out", () => {
    expect(setMatchesSearch(song, "splendor of")).toBe(true);
    expect(setMatchesSearch(song, "majesty")).toBe(true);
  });
  it("doesn't match a chord name or missing words", () => {
    expect(setMatchesSearch(song, "(g)")).toBe(false);
    expect(setMatchesSearch(song, "amazing grace")).toBe(false);
  });
  it("matches everything on an empty search", () => {
    expect(setMatchesSearch(song, "")).toBe(true);
  });
});
