import { describe, expect, it } from "vitest";
import {
  addEntry,
  arrangedEntries,
  arrangedPlace,
  arrangedSequence,
  defaultArrangement,
  effectiveArrangement,
  isWrittenOrder,
  moveEntry,
  removeEntry,
  sectionOptions,
  stepArranged,
  type ArrangedPos,
} from "../arrangements";

// Verse 1 (two slides), Chorus, Verse 2, Chorus (a second written chorus), Bridge.
const slides = [
  { id: "v1a", kind: "lyric", section: "Verse 1" },
  { id: "v1b", kind: "lyric", section: "Verse 1" },
  { id: "c1", kind: "lyric", section: "Chorus" },
  { id: "v2", kind: "lyric", section: "Verse 2" },
  { id: "c2", kind: "lyric", section: "Chorus" },
  { id: "br", kind: "lyric", section: "Bridge" },
];
const WRITTEN = ["Verse 1#0", "Chorus#0", "Verse 2#0", "Chorus#1", "Bridge#0"];

describe("defaultArrangement", () => {
  it("is the written order", () => {
    expect(defaultArrangement(slides)).toEqual(WRITTEN);
  });
  it("starts from what the eye had hidden", () => {
    expect(defaultArrangement(slides, ["Verse 2#0", "Bridge#0"])).toEqual([
      "Verse 1#0",
      "Chorus#0",
      "Chorus#1",
    ]);
  });
  it("never comes out empty", () => {
    expect(defaultArrangement(slides, WRITTEN)).toEqual(WRITTEN);
  });
});

describe("effectiveArrangement", () => {
  it("uses the stored arrangement", () => {
    expect(effectiveArrangement(slides, ["Chorus#0", "Chorus#0"])).toEqual([
      "Chorus#0",
      "Chorus#0",
    ]);
  });
  it("drops keys the song no longer has", () => {
    expect(effectiveArrangement(slides, ["Tag#0", "Bridge#0"])).toEqual(["Bridge#0"]);
  });
  it("falls back to the default when nothing stored survives", () => {
    expect(effectiveArrangement(slides, ["Tag#0"], ["Bridge#0"])).toEqual(WRITTEN.slice(0, 4));
    expect(effectiveArrangement(slides, undefined)).toEqual(WRITTEN);
  });
});

describe("arrangedEntries", () => {
  it("plays repeats, in order, with unique entry keys", () => {
    const e = arrangedEntries(slides, ["Chorus#0", "Verse 1#0", "Chorus#0"]);
    expect(e.map((x) => x.entryKey)).toEqual(["Chorus#0@0", "Verse 1#0@0", "Chorus#0@1"]);
    expect(e[2].group.items.map((i) => i.slide.id)).toEqual(["c1"]);
  });
});

describe("arrangedSequence + stepArranged", () => {
  const arr = ["Verse 1#0", "Chorus#0", "Verse 2#0", "Chorus#0", "Chorus#0"];
  const seq = arrangedSequence(slides, arr);

  it("counts each appearance of a repeated slide", () => {
    expect(seq).toEqual([
      { slideId: "v1a", occ: 0 },
      { slideId: "v1b", occ: 0 },
      { slideId: "c1", occ: 0 },
      { slideId: "v2", occ: 0 },
      { slideId: "c1", occ: 1 },
      { slideId: "c1", occ: 2 },
    ]);
  });

  it("walks forward through the repeats and stops at the end", () => {
    let cur: ArrangedPos | null = { slideId: "v1a", occ: 0 };
    const visited: string[] = [];
    while (cur) {
      visited.push(`${cur.slideId}.${cur.occ}`);
      cur = stepArranged(slides, seq, cur, 1);
    }
    expect(visited).toEqual(["v1a.0", "v1b.0", "c1.0", "v2.0", "c1.1", "c1.2"]);
  });

  it("walks back through the repeats and stops at the start", () => {
    let cur: ArrangedPos | null = { slideId: "c1", occ: 2 };
    const visited: string[] = [];
    while (cur) {
      visited.push(`${cur.slideId}.${cur.occ}`);
      cur = stepArranged(slides, seq, cur, -1);
    }
    expect(visited).toEqual(["c1.2", "c1.1", "v2.0", "c1.0", "v1b.0", "v1a.0"]);
  });

  it("from a removed section, steps to the nearest arranged slide by written order", () => {
    // Bridge (written last) is not arranged: back goes to the last arranged
    // slide written before it; forward has nowhere to go.
    expect(stepArranged(slides, seq, { slideId: "br", occ: 0 }, -1)).toEqual({
      slideId: "c1",
      occ: 2,
    });
    expect(stepArranged(slides, seq, { slideId: "br", occ: 0 }, 1)).toBeNull();
    // c2 (the written second chorus) is not arranged either.
    expect(stepArranged(slides, seq, { slideId: "c2", occ: 0 }, 1)).toBeNull();
    expect(stepArranged(slides, seq, { slideId: "v1b", occ: 0 }, 1)).toEqual({
      slideId: "c1",
      occ: 0,
    });
  });

  it("from a repeat that no longer exists, steps from that slide's last appearance", () => {
    expect(stepArranged(slides, seq, { slideId: "v2", occ: 3 }, 1)).toEqual({
      slideId: "c1",
      occ: 1,
    });
  });

  it("reports the place in the run", () => {
    expect(arrangedPlace(seq, { slideId: "c1", occ: 1 })).toBe(5);
    expect(arrangedPlace(seq, { slideId: "br", occ: 0 })).toBeNull();
  });
});

describe("editing", () => {
  it("removes an entry but never the last one", () => {
    expect(removeEntry(["A#0", "B#0", "A#0"], 2)).toEqual(["A#0", "B#0"]);
    expect(removeEntry(["A#0"], 0)).toBeNull();
  });
  it("moves an entry", () => {
    expect(moveEntry(["A#0", "B#0", "C#0"], 0, 2)).toEqual(["B#0", "C#0", "A#0"]);
    expect(moveEntry(["A#0", "B#0", "C#0"], 2, 0)).toEqual(["C#0", "A#0", "B#0"]);
  });
  it("adds a repeat to the end", () => {
    expect(addEntry(["A#0", "B#0"], "A#0")).toEqual(["A#0", "B#0", "A#0"]);
  });
  it("knows the written order", () => {
    expect(isWrittenOrder(slides, WRITTEN)).toBe(true);
    expect(isWrittenOrder(slides, [...WRITTEN, "Chorus#0"])).toBe(false);
  });
  it("labels sections, numbering a label the song uses twice", () => {
    expect(sectionOptions(slides).map((o) => o.label)).toEqual([
      "Verse 1",
      "Chorus (1)",
      "Verse 2",
      "Chorus (2)",
      "Bridge",
    ]);
    expect(sectionOptions([{ id: "x", kind: "lyric" }])[0].label).toBe("Untitled");
  });
});
