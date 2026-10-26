import { describe, expect, it } from "vitest";
import { chordChangePatch } from "../chord-change";
import type { Slide } from "../types";

const slides: Slide[] = [{ id: "a", kind: "lyric", lines: ["(G)Amazing (C)grace"] }];

describe("chordChangePatch", () => {
  it("transposes the words with the key", () => {
    const p = chordChangePatch({ slides, chords: { key: "G", display: "letters" } }, { key: "A" });
    expect(p?.chords).toEqual({ key: "A", display: "letters" });
    expect(p?.slides?.[0].lines?.[0]).toBe("(A)Amazing (D)grace");
  });

  it("switches letters and numbers without touching the words", () => {
    const p = chordChangePatch(
      { slides, chords: { key: "G", display: "letters" } },
      { display: "numbers" },
    );
    expect(p).toEqual({ chords: { key: "G", display: "numbers" } });
  });

  it("does nothing when nothing changes", () => {
    expect(
      chordChangePatch({ slides, chords: { key: "G", display: "letters" } }, { key: "G" }),
    ).toBe(null);
  });
});
