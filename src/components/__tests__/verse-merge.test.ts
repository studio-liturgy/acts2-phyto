import { describe, expect, it } from "vitest";
import { joinVerse, mergeRowsUp } from "@/components/ScriptureVerseEditor";
import { toVerseRows } from "@/lib/slide-text";

const V = ["NIV", "CUNPS"];
const boxes = {
  NIV: "[John 3:16]\nFor God so loved\n---\nthat he gave\n---\n[John 3:17]\nFor God did not send",
  CUNPS:
    "[約翰福音 3:16]\n神愛世人\n---\n甚至將他的獨生子賜給他們\n---\n[約翰福音 3:17]\n因為神差他的兒子",
};

describe("joinVerse", () => {
  it("puts one space between the verses and tolerates an empty side", () => {
    expect(joinVerse("a ", " b")).toBe("a b");
    expect(joinVerse("", "b")).toBe("b");
    expect(joinVerse("a", "")).toBe("a");
  });
});

describe("mergeRowsUp", () => {
  it("joins a verse onto the one above in every version", () => {
    const rows = toVerseRows(boxes, V);
    const next = mergeRowsUp(rows, 1, V)!;
    expect(next).toHaveLength(2);
    expect(next[0].text.NIV).toBe("For God so loved that he gave");
    expect(next[0].text.CUNPS).toBe("神愛世人 甚至將他的獨生子賜給他們");
    expect(next[1].text.NIV).toBe("For God did not send");
  });

  it("does nothing on the first verse of an import, even with a passage above it", () => {
    const rows = toVerseRows(boxes, V);
    expect(rows[2].starts).toBe(true);
    expect(mergeRowsUp(rows, 2, V)).toBeNull();
    expect(mergeRowsUp(rows, 0, V)).toBeNull();
  });
});
