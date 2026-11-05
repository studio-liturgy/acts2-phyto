import { describe, expect, it } from "vitest";
import type { VerseRow } from "./slide-text";
import type { Slide } from "./types";
import {
  insertSlides,
  insertVerseRows,
  pickCellAt,
  removeVerseRows,
  setRowClip,
  slidesFromClip,
  slidesText,
  versesFromClip,
} from "./row-pick";

const v = (ref: string, text: string, starts = false): VerseRow => ({
  refs: { NIV: ref },
  text: { NIV: text },
  starts,
});
const john = [
  v("John 3:16-18", "For God so loved", true),
  v("John 3:16-18", "For God did not send"),
  v("John 3:16-18", "Whoever believes"),
];
const ps = [
  v("Psalm 23:1-2", "The Lord is my shepherd", true),
  v("Psalm 23:1-2", "He makes me lie down"),
];
const texts = (rows: VerseRow[]) => rows.map((r) => `${r.starts ? "#" : ""}${r.text.NIV}`);

describe("removeVerseRows", () => {
  it("takes out a run inside a passage", () => {
    expect(texts(removeVerseRows(john, 1, 1))).toEqual(["#For God so loved", "Whoever believes"]);
  });
  it("a passage losing its first verse starts at the next one", () => {
    const out = removeVerseRows([...john, ...ps], 0, 1);
    expect(texts(out)).toEqual([
      "#Whoever believes",
      "#The Lord is my shepherd",
      "He makes me lie down",
    ]);
    expect(out[0].refs.NIV).toBe("John 3:16-18");
  });
  it("across two passages", () => {
    expect(texts(removeVerseRows([...john, ...ps], 2, 3))).toEqual([
      "#For God so loved",
      "For God did not send",
      "#He makes me lie down",
    ]);
  });
});

describe("insertVerseRows", () => {
  it("verses of the same passage join it", () => {
    const out = insertVerseRows(john, 1, [john[2]]);
    expect(texts(out)).toEqual([
      "#For God so loved",
      "Whoever believes",
      "For God did not send",
      "Whoever believes",
    ]);
  });
  it("another passage pasted mid-passage stands alone and the rest picks its own back up", () => {
    const out = insertVerseRows(john, 1, ps);
    expect(texts(out)).toEqual([
      "#For God so loved",
      "#The Lord is my shepherd",
      "He makes me lie down",
      "#For God did not send",
      "Whoever believes",
    ]);
    expect(out[3].refs.NIV).toBe("John 3:16-18");
  });
  it("at the end, and at the very top", () => {
    expect(texts(insertVerseRows(john, 3, [ps[1]]))).toEqual([
      "#For God so loved",
      "For God did not send",
      "Whoever believes",
      "#He makes me lie down",
    ]);
    expect(texts(insertVerseRows(john, 0, [john[1]]))[0]).toBe("#For God did not send");
  });
  it("leaves the copied rows untouched", () => {
    const pasted = [v("Psalm 23:1-2", "x")];
    insertVerseRows(john, 1, pasted);
    expect(pasted[0].starts).toBe(false);
  });
});

describe("clip", () => {
  it("brings back the rows only for the words that were copied", () => {
    setRowClip({ kind: "verses", text: "a\r\nb\n", rows: john });
    expect(versesFromClip("a\nb")).toBe(john);
    expect(versesFromClip("a b")).toBeNull();
    expect(slidesFromClip("a\nb")).toBeNull();
  });
});

describe("message slides", () => {
  const point = {
    id: "p",
    kind: "point",
    title: "Grace",
    lines: ["Is free", "Is enough"],
  } as Slide;
  const img = { id: "i", kind: "image" } as Slide;
  const verse = {
    id: "s",
    kind: "scripture",
    lines: ["For God"],
    linesByVersion: { ESV: "For God so" },
  } as Slide;
  it("copies as words, one per line", () => {
    expect(slidesText([verse, point, img], "NIV", "NIV")).toBe(
      "For God\nGrace\nIs free\nIs enough",
    );
    expect(slidesText([verse], "ESV", "NIV")).toBe("For God so");
  });
  it("pastes copies with fresh ids", () => {
    let n = 0;
    const out = insertSlides([point, img], 1, [verse], () => `new${++n}`);
    expect(out.map((s) => s.id)).toEqual(["p", "new1", "i"]);
    expect(out[1].lines).toEqual(["For God"]);
  });
});

describe("pickCellAt", () => {
  const cols = [
    { left: 0, right: 100, top: 0, bottom: 40 },
    { left: 100, right: 200, top: 0, bottom: 40 },
  ];
  it("the box under the finger", () => {
    expect(pickCellAt(cols, 150, 20)).toBe(1);
    expect(pickCellAt(cols, 20, 20)).toBe(0);
  });
  it("the nearest box when the finger is on the row's padding", () => {
    const stacked = [
      { left: 0, right: 200, top: 10, bottom: 30 },
      { left: 0, right: 200, top: 30, bottom: 90 },
    ];
    expect(pickCellAt(stacked, 50, 4)).toBe(0);
    expect(pickCellAt(stacked, 50, 95)).toBe(1);
  });
});
