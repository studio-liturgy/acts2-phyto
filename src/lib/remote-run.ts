// Present from a phone (n133): the gathering as one run of slides, the way
// the remote steps through it. Each set plays in its arranged order (the
// gathering's arrangements and hidden sections, as the presenter and the
// phone views use), sets one after another.

import { arrangedEntries, effectiveArrangement } from "./arrangements";
import type { Set as PhytoSet } from "./types";

export interface RunPos {
  setId: string;
  slideId: string;
  occ: number;
  /** Which slot of the gathering the set sits in (a set can appear twice). */
  slot: number;
  /** The arranged entry (section play) this slide belongs to, unique within
   *  its set ("Chorus#0@1" = the second chorus). */
  entryKey: string;
  /** The section's key ("Chorus#0"), for its name and colour. */
  sectionKey: string;
  /** The section has a name (a set with none shows no section pills). */
  named: boolean;
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
    // Same order and repeat count as arrangedSequence (the presenter's).
    const occ = new Map<string, number>();
    const entries = arrangedEntries(
      d.slides,
      effectiveArrangement(d.slides, arranged[setId], hidden[setId]),
    );
    for (const e of entries) {
      for (const { slide } of e.group.items) {
        if (!slide.id) continue;
        const n = occ.get(slide.id) ?? 0;
        occ.set(slide.id, n + 1);
        out.push({
          setId,
          slideId: slide.id,
          occ: n,
          slot,
          entryKey: e.entryKey,
          sectionKey: e.group.key,
          named: e.group.section !== null,
        });
      }
    }
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

/** A slot's sections in play order, each with the run index of its first
 *  slide (the section pills: a tap goes to the start of that section). */
export function slotSections(
  run: RunPos[],
  slot: number,
): { entryKey: string; sectionKey: string; start: number; end: number }[] {
  const out: { entryKey: string; sectionKey: string; start: number; end: number }[] = [];
  run.forEach((p, i) => {
    if (p.slot !== slot) return;
    const last = out[out.length - 1];
    if (last && last.entryKey === p.entryKey) last.end = i;
    else out.push({ entryKey: p.entryKey, sectionKey: p.sectionKey, start: i, end: i });
  });
  return out;
}
