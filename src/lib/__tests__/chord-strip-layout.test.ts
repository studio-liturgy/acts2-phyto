import { describe, expect, it } from "vitest";
import { spreadChordLefts } from "../chord-strip-layout";

describe("spreadChordLefts", () => {
  it("leaves chords over different words where they are", () => {
    expect(spreadChordLefts([0, 50, 120], [10, 10, 10])).toEqual([0, 50, 120]);
  });

  it("lines up a run of chords on one word one after another (the 'praise' report)", () => {
    // "praise (F)(G)(C)(Em7)(Am)": five chords, all at the end of the line.
    expect(spreadChordLefts([200, 200, 200, 200, 200], [6, 6, 6, 18, 12])).toEqual([
      200, 210, 220, 230, 252,
    ]);
  });

  it("pushes a chord right when the one before is too wide to fit", () => {
    expect(spreadChordLefts([0, 8], [30, 10])).toEqual([0, 34]);
  });
});
