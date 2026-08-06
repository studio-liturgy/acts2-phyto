import { describe, expect, it } from "vitest";
import { applyDividers } from "../../routes/set.$setId";

// Regression test for a bug where re-running applyDividers on already-divided
// text (which every search-result import produces once) was a no-op: the
// "lines per slide" arrows appeared to work — the confirmation dialog fired —
// but the dividers never actually moved.
describe("applyDividers", () => {
  const raw =
    "Bless the Lord O my soul\nO my soul\nWorship His holy name\nSing like never before\nO my soul\nIll worship Your holy name";

  it("divides fresh text by linesPer", () => {
    expect(applyDividers(raw, 2)).toBe(
      "Bless the Lord O my soul\nO my soul\n---\nWorship His holy name\nSing like never before\n---\nO my soul\nIll worship Your holy name",
    );
  });

  it("re-divides already-divided text when linesPer changes", () => {
    const dividedBy2 = applyDividers(raw, 2);
    const dividedBy3 = applyDividers(dividedBy2, 3);
    expect(dividedBy3).toBe(
      "Bless the Lord O my soul\nO my soul\nWorship His holy name\n---\nSing like never before\nO my soul\nIll worship Your holy name",
    );
    // Genuinely different structure, not the old grouping surviving untouched.
    expect(dividedBy3).not.toBe(dividedBy2);
  });

  it("round-trips back to the original grouping", () => {
    const dividedBy3 = applyDividers(applyDividers(raw, 2), 3);
    expect(applyDividers(dividedBy3, 2)).toBe(applyDividers(raw, 2));
  });

  it("keeps a chord-only line riding along without using up the quota", () => {
    const withChords =
      "[Verse 1]\n(G)Bless the (C)Lord O my soul\nO my (D)soul\n(G) (C) (D)\nWorship His (G)holy name\nSing like (Em)never before\nO my soul\nIll worship Your holy name";
    const dividedBy2 = applyDividers(withChords, 2);
    const dividedBy3 = applyDividers(dividedBy2, 3);
    // Chords and the instrumental line survive, unmangled, at the new grouping.
    expect(dividedBy3).toBe(
      "[Verse 1]\n(G)Bless the (C)Lord O my soul\nO my (D)soul\n(G) (C) (D)\nWorship His (G)holy name\n---\nSing like (Em)never before\nO my soul\nIll worship Your holy name",
    );
  });

  it("keeps a real stanza break as an early group boundary", () => {
    const withBreak = "one\ntwo\n\nthree";
    expect(applyDividers(withBreak, 3)).toBe("one\ntwo\n---\nthree");
  });
});
