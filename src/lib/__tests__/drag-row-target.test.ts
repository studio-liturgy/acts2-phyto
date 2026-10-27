import { describe, expect, it } from "vitest";
import { dragRowTarget, moveItem } from "../phone-layout";

// A grid column: each row's height (a slide break is thin, a line is tall).
type Row = { id: string; h: number };
const BREAK: Row = { id: "break", h: 16 };
const line = (id: string): Row => ({ id, h: 44 });

function rowAt(rows: Row[], y: number): { index: number; top: number; height: number } | null {
  let top = 0;
  for (let i = 0; i < rows.length; i++) {
    if (y >= top && y < top + rows[i].h) return { index: i, top, height: rows[i].h };
    top += rows[i].h;
  }
  return null;
}

// The old Multi-Language rule: the dragged row takes the index of the row
// under the finger.
function oldStep(rows: Row[], from: number, y: number): { rows: Row[]; from: number } {
  const over = rowAt(rows, y);
  if (!over || over.index === from) return { rows, from };
  return { rows: moveItem(rows, from, over.index), from: over.index };
}

function newStep(rows: Row[], from: number, y: number): { rows: Row[]; from: number } {
  const over = rowAt(rows, y);
  if (!over) return { rows, from };
  const to = dragRowTarget(from, over.index, y, over.top, over.height);
  if (to === null) return { rows, from };
  return { rows: moveItem(rows, from, to), from: to };
}

// The finger resting on one spot fires pointermove again and again (tiny
// tremors); record where the break sits after each.
function replay(step: typeof oldStep, ys: number[]): number[] {
  let rows = [BREAK, line("a"), line("b"), line("c")];
  let from = 0;
  const at: number[] = [];
  for (const y of ys) {
    ({ rows, from } = step(rows, from, y));
    at.push(rows.findIndex((r) => r.id === "break"));
  }
  return at;
}

describe("dragRowTarget", () => {
  const still = [30, 30, 31, 30, 31, 30];

  it("old rule: a slide break held over the next line flicks between two places", () => {
    const at = replay(oldStep, still);
    expect(new Set(at).size).toBe(2);
  });

  it("holds the break still while the finger rests", () => {
    const at = replay(newStep, still);
    expect(new Set(at).size).toBe(1);
  });

  it("moves it down one line once the finger passes that line's middle", () => {
    // Line a spans 16..60, middle 38.
    expect(replay(newStep, [30, 36])).toEqual([0, 0]);
    expect(replay(newStep, [45, 45, 46])).toEqual([1, 1, 1]);
  });

  it("follows a steady drag down and back up without bouncing", () => {
    const down = [20, 40, 60, 80, 100, 120, 140, 150];
    const at = replay(newStep, [...down, ...[...down].reverse(), 5]);
    // Never goes back the way it came within one direction of travel.
    const firstHalf = at.slice(0, down.length);
    const secondHalf = at.slice(down.length);
    expect(firstHalf).toEqual([...firstHalf].sort((a, b) => a - b));
    expect(secondHalf).toEqual([...secondHalf].sort((a, b) => b - a));
    expect(firstHalf[firstHalf.length - 1]).toBe(3);
    expect(secondHalf[secondHalf.length - 1]).toBe(0);
  });

  it("does nothing over the dragged row itself or in the dead band", () => {
    expect(dragRowTarget(2, 2, 10, 0, 40)).toBeNull();
    expect(dragRowTarget(0, 1, 22, 0, 40)).toBeNull();
  });
});
