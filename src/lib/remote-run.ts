// Present from a phone (n133): the gathering as one run of slides, the way
// the remote steps through it. Each set plays in its arranged order (the
// gathering's arrangements and hidden sections, as the presenter and the
// phone views use), sets one after another.

import { arrangedSequence, effectiveArrangement } from "./arrangements";
import type { Set as PhytoSet } from "./types";

export interface RunPos {
  setId: string;
  slideId: string;
  occ: number;
  /** Which slot of the gathering the set sits in (a set can appear twice). */
  slot: number;
}

/** Every slide of the gathering in play order. Missing sets are skipped. */
export function gatheringRun(
  setIds: string[],
  sets: Record<string, PhytoSet | undefined>,
  arranged: Record<string, string[]> = {},
  hidden: Record<string, string[]> = {},
): RunPos[] {
  const out: RunPos[] = [];
  setIds.forEach((setId, slot) => {
    const d = sets[setId];
    if (!d) return;
    const seq = arrangedSequence(
      d.slides,
      effectiveArrangement(d.slides, arranged[setId], hidden[setId]),
    );
    for (const p of seq) out.push({ setId, slideId: p.slideId, occ: p.occ, slot });
  });
  return out;
}

/** Index of the live slide in the run, or -1. A set that appears twice is
 *  matched at its first slot. */
export function runIndex(
  run: RunPos[],
  live: { setId: string | null; slideId: string | null; slideOcc?: number },
): number {
  if (!live.setId || !live.slideId) return -1;
  const occ = live.slideOcc ?? 0;
  const exact = run.findIndex(
    (p) => p.setId === live.setId && p.slideId === live.slideId && p.occ === occ,
  );
  if (exact >= 0) return exact;
  return run.findIndex((p) => p.setId === live.setId && p.slideId === live.slideId);
}

/** The slide one step forward or back from `at` (-1 = nothing live: Next
 *  starts at the first slide, Previous does nothing), or null at either end. */
export function stepRun(run: RunPos[], at: number, dir: 1 | -1): RunPos | null {
  if (at < 0) return dir === 1 ? (run[0] ?? null) : null;
  return run[at + dir] ?? null;
}

/** The item whose centre is nearest the middle of a horizontal scroller, from
 *  each item's left edge and width (scroll coordinates) and the scroller's
 *  scrollLeft and width. */
export function centredIndex(
  items: { left: number; width: number }[],
  scrollLeft: number,
  width: number,
): number {
  const mid = scrollLeft + width / 2;
  let best = -1;
  let bestDist = Infinity;
  items.forEach((it, i) => {
    const d = Math.abs(it.left + it.width / 2 - mid);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}
