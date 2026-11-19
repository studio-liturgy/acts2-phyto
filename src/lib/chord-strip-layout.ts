/**
 * Chord strip layout: each chord sits over its word, but chords that would
 * touch (several on one word, like a closing run "praise (F)(G)(C)(Em7)(Am)")
 * are pushed right so each starts `gap` px after the one before it ends.
 *
 * `lefts` are where each chord would sit (its word's x), in line order;
 * `widths` are the chords' drawn widths. Returns the left to draw each one at.
 */
export function spreadChordLefts(lefts: number[], widths: number[], gap = 4): number[] {
  const out: number[] = [];
  let end = -Infinity;
  lefts.forEach((left, i) => {
    const x = Math.max(left, end + gap);
    out.push(x);
    end = x + (widths[i] ?? 0);
  });
  return out;
}
