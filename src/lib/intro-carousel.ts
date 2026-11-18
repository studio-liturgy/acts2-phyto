/**
 * The phone intro's looping carousel (components/phone/PhoneIntro.tsx).
 *
 * Each page has exactly one element (never a copy), so a recording keeps
 * playing smoothly across the loop. `pos` counts steps without wrapping
 * (it can go below 0 or past the last page); each page sits at its offset
 * from `pos`, wrapped so the pages next to the current one are always ±1.
 * A page whose offset wraps round the far side moves off screen, unanimated.
 */

/** How long (ms) a page stays before the carousel moves on by itself: one
 *  fixed time for every page, long enough for the longest recording (11.9 s). */
export const INTRO_AUTO_MS = 12000;

/** The page (0-based) showing at an unwrapped position. */
export function pageAt(pos: number, count: number): number {
  return ((pos % count) + count) % count;
}

/** Where page `i` sits relative to the current position, in slide widths:
 *  0 is in view, -1 to the left, 1 to the right (wrapped into
 *  1 - count/2 .. count/2 for an even count). */
export function slideOffset(i: number, pos: number, count: number): number {
  const o = pageAt(i - pos, count);
  return o > count / 2 ? o - count : o;
}

/** Whether page `i` slides (animates) going from one position to another:
 *  only when it moves a single step. A jump round the far side happens off
 *  screen, without animation. */
export function slides(i: number, from: number, to: number, count: number): boolean {
  return Math.abs(slideOffset(i, to, count) - slideOffset(i, from, count)) <= 1;
}

/** Where a finished swipe goes: -1 back, 1 forward, 0 stays.
 *  A swipe counts once it travels a fifth of the width, or flicks fast
 *  (over 0.3 px per ms) for more than 10 px. */
export function swipeStep(dx: number, width: number, ms: number): -1 | 0 | 1 {
  const fast = Math.abs(dx) > 10 && Math.abs(dx) / Math.max(ms, 1) > 0.3;
  if (Math.abs(dx) < width / 5 && !fast) return 0;
  return dx < 0 ? 1 : -1;
}
