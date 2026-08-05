import { describe, expect, it } from "vitest";
import {
  chordRowsToInline,
  chordStreamToInline,
  chordToNumber,
  diatonicChords,
  looksLikeChordStream,
  normaliseChordSheet,
  transposeLyrics,
  guessKey,
  isChordRow,
  looksLikeChordSheet,
  hasChords,
  isChordOnlyLine,
  isChordToken,
  parseChordLine,
  renderChord,
  stripChords,
  toChordSegments,
  transposeChord,
} from "../chords";

describe("isChordToken", () => {
  it("accepts real chords", () => {
    for (const c of [
      "G",
      "Am",
      "Bb",
      "F#m",
      "C7",
      "Cmaj7",
      "Dsus4",
      "Gadd9",
      "Bdim",
      "Am7b5",
      "G/B",
      "F#m7",
      "Eb",
      "A+",
    ]) {
      expect(isChordToken(c), c).toBe(true);
    }
  });

  // The whole point of the quality whitelist: ordinary parenthetical lyrics
  // must survive as literal text, including ones starting with A-G.
  it("rejects lyric asides", () => {
    for (const t of [
      "Chorus",
      "Bridge",
      "God",
      "Glory",
      "Amazing",
      "Amen",
      "Ah",
      "Ooh",
      "x2",
      "2x",
      "repeat",
      "Guitar solo",
      "Deep",
      "Come",
      "Bass",
      "Fade",
      "",
    ]) {
      expect(isChordToken(t), t).toBe(false);
    }
  });
});

describe("parseChordLine", () => {
  it("anchors chords to the syllable they precede", () => {
    const { text, chords } = parseChordLine("Amazing (G)grace how (C)sweet the sound");
    expect(text).toBe("Amazing grace how sweet the sound");
    expect(chords).toEqual([
      { chord: "G", index: 8 },
      { chord: "C", index: 18 },
    ]);
    expect(text.slice(8, 13)).toBe("grace");
    expect(text.slice(18, 23)).toBe("sweet");
  });

  it("snaps a chord written before a space onto the next word", () => {
    const spaced = parseChordLine("Amazing (G) grace");
    const tight = parseChordLine("Amazing (G)grace");
    expect(spaced).toEqual(tight);
    expect(spaced.text).toBe("Amazing grace");
  });

  it("leaves non-chord parentheses alone", () => {
    const { text, chords } = parseChordLine("How great is our God (x2)");
    expect(text).toBe("How great is our God (x2)");
    expect(chords).toEqual([]);
  });

  it("handles a chord at the start and one past the end", () => {
    const { text, chords } = parseChordLine("(G)Holy is the Lord (D)");
    expect(text).toBe("Holy is the Lord");
    expect(chords).toEqual([
      { chord: "G", index: 0 },
      { chord: "D", index: 16 },
    ]);
    expect(chords[1].index).toBe(text.length);
  });

  it("keeps both chords when two share an anchor", () => {
    const { text, chords } = parseChordLine("(G)(C)sound");
    expect(text).toBe("sound");
    expect(chords).toEqual([
      { chord: "G", index: 0 },
      { chord: "C", index: 0 },
    ]);
  });
});

describe("stripChords", () => {
  it("is what the projector renders", () => {
    expect(stripChords("Amazing (G)grace how (C)sweet the (G)sound")).toBe(
      "Amazing grace how sweet the sound",
    );
  });

  it("collapses the gap a removed chord leaves behind", () => {
    expect(stripChords("Amazing (G) grace")).toBe("Amazing grace");
    expect(stripChords("(G) Amazing grace (D) ")).toBe("Amazing grace");
  });

  it("is a no-op on lines without chords", () => {
    expect(stripChords("Amazing grace how sweet the sound")).toBe(
      "Amazing grace how sweet the sound",
    );
  });
});

describe("isChordOnlyLine", () => {
  it("spots an instrumental line", () => {
    expect(isChordOnlyLine("(G) (C) (D)")).toBe(true);
    expect(isChordOnlyLine("(Em)")).toBe(true);
  });

  it("does not fire on lyrics", () => {
    expect(isChordOnlyLine("Amazing (G)grace")).toBe(false);
    expect(isChordOnlyLine("Amazing grace")).toBe(false);
    expect(isChordOnlyLine("(x2)")).toBe(false);
  });
});

describe("chordToNumber", () => {
  it("numbers the diatonic chords in G", () => {
    const inG = (c: string) => chordToNumber(c, "G");
    expect(inG("G")).toBe("1");
    expect(inG("Am")).toBe("2m");
    expect(inG("Bm")).toBe("3m");
    expect(inG("C")).toBe("4");
    expect(inG("D")).toBe("5");
    expect(inG("Em")).toBe("6m");
    expect(inG("F#dim")).toBe("7dim");
  });

  it("keeps extensions and slash bass notes", () => {
    expect(chordToNumber("G7", "G")).toBe("17");
    expect(chordToNumber("Cmaj7", "G")).toBe("4maj7");
    expect(chordToNumber("G/B", "G")).toBe("1/3");
    expect(chordToNumber("Dsus4", "G")).toBe("5sus4");
  });

  it("marks chords outside the key", () => {
    expect(chordToNumber("Bb", "G")).toBe("b3");
    expect(chordToNumber("F", "G")).toBe("b7");
    expect(chordToNumber("E", "G")).toBe("6");
  });

  it("works in a flat key", () => {
    expect(chordToNumber("Eb", "Eb")).toBe("1");
    expect(chordToNumber("Ab", "Eb")).toBe("4");
    expect(chordToNumber("Cm", "Eb")).toBe("6m");
  });
});

describe("transposeChord", () => {
  it("shifts roots and bass notes together", () => {
    expect(transposeChord("G", "G", "A")).toBe("A");
    expect(transposeChord("C", "G", "A")).toBe("D");
    expect(transposeChord("Em", "G", "A")).toBe("F#m");
    expect(transposeChord("G/B", "G", "A")).toBe("A/C#");
    expect(transposeChord("Cmaj7", "G", "A")).toBe("Dmaj7");
  });

  it("spells flat keys with flats", () => {
    expect(transposeChord("G", "G", "Eb")).toBe("Eb");
    expect(transposeChord("Am", "G", "Eb")).toBe("Fm");
    expect(transposeChord("C", "G", "F")).toBe("Bb");
  });

  it("returns the chord untouched when nothing moves", () => {
    expect(transposeChord("G", "G", "G")).toBe("G");
  });
});

describe("renderChord", () => {
  it("follows the song's display setting", () => {
    expect(renderChord("Am", { key: "G", display: "numbers" })).toBe("2m");
    expect(renderChord("Am", { key: "G", display: "letters" })).toBe("Am");
  });
});

describe("guessKey / hasChords", () => {
  it("guesses from the first chord", () => {
    expect(guessKey("Amazing (G)grace how (C)sweet")).toBe("G");
    expect(guessKey("(A#m)something")).toBe("Bb");
    expect(guessKey("no chords here")).toBe(null);
  });

  it("detects chords anywhere in the lyrics", () => {
    expect(hasChords("line one\nAmazing (G)grace")).toBe(true);
    expect(hasChords("line one (x2)\nline two")).toBe(false);
  });
});

describe("chordRowsToInline", () => {
  it("folds an Ultimate Guitar sheet onto its lyrics", () => {
    const ug = [
      "C",
      "May my prayer like incense rise before You",
      "    Am",
      "The lifting of my hands a sacrifice",
    ].join("\n");
    expect(chordRowsToInline(ug)).toBe(
      [
        "(C)May my prayer like incense rise before You",
        "The (Am)lifting of my hands a sacrifice",
      ].join("\n"),
    );
  });

  it("snaps a chord landing mid-word back onto that word", () => {
    // The G sits at column 32, inside "You|r" — chord-sheet alignment is
    // approximate, so it belongs to "Your".
    const ug = [
      "   Dm                           G",
      "For I know there is mercy in Your sight",
    ].join("\n");
    expect(chordRowsToInline(ug)).toBe("For (Dm)I know there is mercy in (G)Your sight");
  });

  it("keeps the exact column when two chords share one word", () => {
    // Both land inside "Amazing"; the second is a real mid-word change.
    expect(chordRowsToInline("C    G\nAmazing")).toBe("(C)Amazi(G)ng");
  });

  it("turns a chord row with no lyric under it into an instrumental line", () => {
    expect(chordRowsToInline("G  C  D\n\nnext bit")).toBe("(G) (C) (D)\n\nnext bit");
    // "Am" is followed by another chord row, so only "F" gets a lyric.
    expect(chordRowsToInline("Am\nF\nlyric")).toBe("(Am)\n(F)lyric");
  });

  it("leaves text with no chord rows untouched", () => {
    const plain = "Amazing grace how sweet the sound\nThat saved a wretch like me";
    expect(chordRowsToInline(plain)).toBe(plain);
  });

  it("round-trips back to the same anchors", () => {
    const inline = chordRowsToInline("    Am\nThe lifting of my hands");
    const { text, chords } = parseChordLine(inline);
    expect(text).toBe("The lifting of my hands");
    expect(chords).toEqual([{ chord: "Am", index: 4 }]);
    expect(text.slice(4, 11)).toBe("lifting");
  });
});

describe("chordStreamToInline (WorshipTogether layout)", () => {
  // One chord per line, lyric split into runs around it. The trailing space on
  // a run is what says "the next chord is inside this line".
  const WT = [
    "Verse 1",
    "  ",
    "The ",
    "G ",
    "splendor of the ",
    "D/F# ",
    "King",
    " Em7 ",
    "Clothed in majesty",
    "  ",
    "Let all the earth ",
    "Cmaj7 ",
    "rejoice",
    "  ",
    "All the earth rejoice",
  ].join("\n");

  it("is recognised as a stream, not a column sheet", () => {
    expect(looksLikeChordStream(WT)).toBe(true);
    expect(looksLikeChordStream("C\nfirst line\nAm\nsecond line")).toBe(false);
  });

  it("rebuilds the original lines", () => {
    expect(normaliseChordSheet(WT)).toBe(
      [
        "[Verse 1]",
        "The (G)splendor of the (D/F#)King",
        "(Em7)Clothed in majesty",
        "Let all the earth (Cmaj7)rejoice",
        "All the earth rejoice",
      ].join("\n"),
    );
  });

  it("breaks the line when a run ends without a trailing space", () => {
    // "King" is complete, so Em7 belongs to the next line, not to "King".
    expect(chordStreamToInline("King\n Em7 \nClothed")).toBe("King\n(Em7)Clothed");
    // "The " is mid-phrase, so G stays inside the line.
    expect(chordStreamToInline("The \nG \nsplendor")).toBe("The (G)splendor");
  });

  it("brackets bare section labels so they aren't projected", () => {
    expect(chordStreamToInline("Verse 1\n  \nThe \nG \nword")).toBe("[Verse 1]\nThe (G)word");
    expect(chordStreamToInline("Chorus\n  \nThe \nG \nword")).toBe("[Chorus]\nThe (G)word");
    // Not a section name, so it stays a lyric.
    expect(chordStreamToInline("Hello there\n  \nThe \nG \nword")).toBe("Hello there\nThe (G)word");
  });
});

describe("transposeLyrics", () => {
  it("moves every chord and leaves other brackets alone", () => {
    expect(transposeLyrics("Amazing (G)grace how (Am)sweet (x2)", "G", "A")).toBe(
      "Amazing (A)grace how (Bm)sweet (x2)",
    );
  });

  it("round-trips back to the original spelling", () => {
    const original = "(G)one (Em)two (C)three (D/F#)four";
    const there = transposeLyrics(original, "G", "Bb");
    expect(there).toBe("(Bb)one (Gm)two (Eb)three (F/A)four");
    expect(transposeLyrics(there, "Bb", "G")).toBe(original);
  });

  it("is a no-op when the key doesn't change", () => {
    expect(transposeLyrics("(G)x", "G", "G")).toBe("(G)x");
  });
});

describe("diatonicChords", () => {
  it("gives the chord palette for a key", () => {
    expect(diatonicChords("G")).toEqual(["G", "Am", "Bm", "C", "D", "Em", "F#dim"]);
    expect(diatonicChords("C")).toEqual(["C", "Dm", "Em", "F", "G", "Am", "Bdim"]);
  });

  it("spells a flat key with flats", () => {
    expect(diatonicChords("F")).toEqual(["F", "Gm", "Am", "Bb", "C", "Dm", "Edim"]);
    expect(diatonicChords("Eb")).toEqual(["Eb", "Fm", "Gm", "Ab", "Bb", "Cm", "Ddim"]);
  });

  it("numbers the palette consistently", () => {
    expect(diatonicChords("G").map((c) => chordToNumber(c, "G"))).toEqual([
      "1",
      "2m",
      "3m",
      "4",
      "5",
      "6m",
      "7dim",
    ]);
  });
});

describe("isChordRow / looksLikeChordSheet", () => {
  it("spots chord rows", () => {
    expect(isChordRow("C")).toBe(true);
    expect(isChordRow("   Dm                           G")).toBe(true);
    expect(isChordRow("G/B  Am7  Cmaj7")).toBe(true);
    expect(isChordRow("")).toBe(false);
    expect(isChordRow("The lifting of my hands")).toBe(false);
    expect(isChordRow("Am I the one")).toBe(false);
  });

  it("needs two chord rows before it will rewrite anything", () => {
    // A lyric with one accidental single-letter line must not be converted.
    expect(looksLikeChordSheet("A\nlong time ago\nsomething else")).toBe(false);
    expect(looksLikeChordSheet("C\nfirst line\nAm\nsecond line")).toBe(true);
  });
});

describe("toChordSegments", () => {
  it("puts each chord above its own word and keeps break opportunities", () => {
    const segs = toChordSegments(parseChordLine("Amazing (G)grace how (C)sweet"));
    expect(segs).toEqual([
      { chord: undefined, text: "Amazing", space: true },
      { chord: "G", text: "grace", space: true },
      { chord: undefined, text: "how", space: true },
      { chord: "C", text: "sweet", space: false },
    ]);
  });

  it("splits a word when a chord lands mid-word", () => {
    const segs = toChordSegments(parseChordLine("Ama(G)zing"));
    expect(segs).toEqual([
      { chord: undefined, text: "Ama", space: false },
      { chord: "G", text: "zing", space: false },
    ]);
  });

  it("applies the render function to every chord", () => {
    const segs = toChordSegments(parseChordLine("Amazing (G)grace how (Am)sweet"), (c) =>
      chordToNumber(c, "G"),
    );
    expect(segs.map((s) => s.chord)).toEqual([undefined, "1", undefined, "2m"]);
  });

  it("joins chords that share an anchor", () => {
    const segs = toChordSegments(parseChordLine("(G)(C)sound"));
    expect(segs).toEqual([{ chord: "G C", text: "sound", space: false }]);
  });

  it("emits a trailing chord with no text under it", () => {
    const segs = toChordSegments(parseChordLine("sound (D)"));
    expect(segs).toEqual([
      { chord: undefined, text: "sound", space: true },
      { chord: "D", text: "", space: false },
    ]);
  });
});
