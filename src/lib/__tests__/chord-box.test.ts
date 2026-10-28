import { describe, expect, it } from "vitest";
import { chordForBox, chordFromBox, setChordAt, type SongChords } from "../chords";

const numbers: SongChords = { key: "G", display: "numbers" };
const letters: SongChords = { key: "G", display: "letters" };

describe("the grid's chord box in numbers mode", () => {
  it("opens on the chord's number, as the strip shows it", () => {
    expect(chordForBox("C", numbers)).toBe("4");
    expect(chordForBox("Em", numbers)).toBe("6m");
    expect(chordForBox("C", letters)).toBe("C");
  });

  it("stores a typed number as its letter chord", () => {
    expect(chordFromBox("4", numbers)).toBe("C");
    expect(chordFromBox(" 5 ", numbers)).toBe("D");
    // A letter typed in numbers mode stays a letter.
    expect(chordFromBox("Am", numbers)).toBe("Am");
    expect(chordFromBox("4", letters)).toBe("4");
  });

  it("round trip: open, leave as is, close: the stored line is unchanged", () => {
    const line = "Amazing (C)grace";
    const shown = chordForBox("C", numbers);
    expect(setChordAt(line, 8, chordFromBox(shown, numbers))).toBe(line);
  });
});
