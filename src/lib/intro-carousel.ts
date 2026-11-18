/**
 * The phone intro's looping carousel (components/phone/PhoneIntro.tsx).
 *
 * The track holds the pages with a copy of the last page before the first and
 * a copy of the first after the last: [P_last, P_1 ... P_n, P_1]. Track
 * positions 1..n are the real pages. Sliding onto a copy (0 or n + 1) plays
 * the slide, then jumps without animation to the real page it copies, so the
 * loop never shows a seam.
 */

/** How long (ms) a page stays before the carousel moves on by itself: one
 *  fixed time for every page, long enough for the longest recording (11.9 s). */
export const INTRO_AUTO_MS = 12000;

/** The page (0-based) shown at a track position. */
export function pageAt(pos: number, count: number): number {
  return (((pos - 1) % count) + count) % count;
}

/** The real track position a copy stands for, or null when `pos` is real. */
export function loopJump(pos: number, count: number): number | null {
  if (pos <= 0) return count;
  if (pos >= count + 1) return 1;
  return null;
}

/** Where a finished swipe goes: -1 back, 1 forward, 0 stays.
 *  A swipe counts once it travels a fifth of the width, or flicks fast
 *  (over 0.3 px per ms) for more than 10 px. */
export function swipeStep(dx: number, width: number, ms: number): -1 | 0 | 1 {
  const fast = Math.abs(dx) > 10 && Math.abs(dx) / Math.max(ms, 1) > 0.3;
  if (Math.abs(dx) < width / 5 && !fast) return 0;
  return dx < 0 ? 1 : -1;
}
