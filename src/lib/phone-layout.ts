// The phone layout (phone browser, phase 1): screens under 768px wide get
// their own home, gathering and set editor screens. Tablets keep the desktop
// layout for now. Test only until phase 1 ships.

import type { Gathering, Set as PhytoSet, SetKind } from "./types";

const isTest = import.meta.env.VITE_APP_ENV === "test";

/** Whether this build has the phone layout at all. */
export const PHONE_UI = isTest;

/** Screens narrower than this get the phone layout (Tailwind's `md`). */
export const PHONE_MAX_WIDTH = 767;

export const PHONE_QUERY = `(max-width: ${PHONE_MAX_WIDTH}px)`;

/** The three screens of the bottom tab bar on the phone home. */
export type PhoneTab = "gatherings" | "catalogue" | "account";

export const PHONE_TABS: PhoneTab[] = ["gatherings", "catalogue", "account"];

export function parsePhoneTab(v: unknown): PhoneTab | undefined {
  return v === "catalogue" || v === "account" || v === "gatherings" ? v : undefined;
}

/**
 * Touch reorder: the position a dragged row lands at, from the vertical
 * centres of every row (in their current order) and the finger's y. The
 * dragged row's own centre is ignored; the row goes after every other row
 * whose centre the finger has passed.
 */
export function reorderTarget(mids: number[], from: number, y: number): number {
  let target = 0;
  for (let i = 0; i < mids.length; i++) {
    if (i === from) continue;
    if (mids[i] < y) target++;
  }
  return target;
}

/** A copy of `list` with the item at `from` moved to `to`. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, moved);
  return next;
}

/** Stable empties for store selectors read before the library loads. */
export const NO_SETS: Record<string, PhytoSet> = {};
export const NO_GATHERINGS: Record<string, Gathering> = {};
export const NO_IDS: string[] = [];

/** Kind colours, as on the desktop home's pills. */
export function phoneKindBg(kind: SetKind | string): string {
  if (kind === "song") return "bg-[var(--brand-blue)] text-[var(--brand-white)]";
  if (kind === "scripture") return "bg-[var(--brand-green)] text-[var(--brand-white)]";
  if (kind === "message") return "bg-[var(--brand-green-dark)] text-[var(--brand-white)]";
  if (kind === "media") return "bg-[var(--brand-orange)] text-[var(--brand-white)]";
  return "bg-muted text-foreground";
}
