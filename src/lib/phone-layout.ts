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
export type PhoneTab = "gatherings" | "catalogue" | "settings";

export const PHONE_TABS: PhoneTab[] = ["gatherings", "catalogue", "settings"];

export function parsePhoneTab(v: unknown): PhoneTab | undefined {
  return v === "catalogue" || v === "settings" || v === "gatherings" ? v : undefined;
}

/**
 * The phone home's tab: the one asked for, else Gatherings, except when the
 * account has no gatherings and no sets, which starts on the Catalogue (the
 * first thing to make is a set). The Gatherings tab asks by name, so it still
 * opens on an empty account.
 */
export function phoneHomeTab(asked: PhoneTab | undefined, empty: boolean): PhoneTab {
  return asked ?? (empty ? "catalogue" : "gatherings");
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

/**
 * Touch drag in the song grids: where the dragged row goes, from the row
 * under the finger. Past that row's middle it goes after it, above the middle
 * before it, and within `slack` px of the middle it stays put. Returns the
 * dragged row's new index (current indices), or null for no move.
 *
 * Taking "the row under the finger" as the new index made a thin row (a slide
 * break, a section heading) flick back and forth: once it moved, the finger
 * was over the row it had just swapped with, which sent it back.
 */
export function dragRowTarget(
  from: number,
  over: number,
  clientY: number,
  top: number,
  height: number,
  slack = 4,
): number | null {
  if (over === from) return null;
  const slot = dragRowSlot(over, clientY, top, height, slack);
  if (slot === null) return null;
  const to = slot > from ? slot - 1 : slot;
  return to === from ? null : to;
}

/**
 * The same rule as `dragRowTarget`, as the index to insert BEFORE (the row
 * under the finger, or the one after it once past its middle); null in the
 * dead band. For grids whose move takes an insert-before index (Call and
 * Response's `moveLine`).
 */
export function dragRowSlot(
  over: number,
  clientY: number,
  top: number,
  height: number,
  slack = 4,
): number | null {
  const mid = top + height / 2;
  if (clientY < mid - slack) return over;
  if (clientY > mid + slack) return over + 1;
  return null;
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

/**
 * Multi-Language on a phone: the (at most two) language columns the grid
 * shows. Keeps the picked languages that still exist, in the song's column
 * order, and fills up to two from the song's first columns.
 */
export function phoneLangPair<T extends string>(langs: readonly T[], picked: readonly T[]): T[] {
  const want = Math.min(2, langs.length);
  const kept = langs.filter((c) => picked.includes(c)).slice(0, want);
  for (const c of langs) {
    if (kept.length >= want) break;
    if (!kept.includes(c)) kept.push(c);
  }
  return langs.filter((c) => kept.includes(c));
}

/**
 * Tapping a language chip: an unshown language replaces the one picked
 * longest ago, so two always show; a shown one stays. `picked` is in the
 * order the languages were picked (oldest first).
 */
export function tapPairLang<T extends string>(
  langs: readonly T[],
  picked: readonly T[],
  code: T,
): T[] {
  const shown = phoneLangPair(langs, picked);
  // Oldest first: the picked ones in picked order, then any filled in.
  const order = [
    ...picked.filter((c) => shown.includes(c)),
    ...shown.filter((c) => !picked.includes(c)),
  ];
  if (shown.includes(code)) return order;
  const next = [...order, code];
  return next.length > 2 ? next.slice(next.length - 2) : next;
}

/**
 * The phone view (/g) of a live gathering: which of this device's own
 * gatherings it is, so a signed-in leader can add sets to it on the fly. The
 * share view carries no gathering id, so it's the local live gathering with
 * the same name holding every set the page shows. Null = not yours.
 */
export function ownLiveGathering(
  gatherings: Record<string, Pick<Gathering, "id" | "name" | "setIds">>,
  isLive: (id: string) => boolean,
  title: string,
  shownSetIds: readonly string[],
): string | null {
  for (const g of Object.values(gatherings)) {
    if (!g || g.name !== title || !isLive(g.id)) continue;
    if (shownSetIds.every((id) => g.setIds.includes(id))) return g.id;
  }
  return null;
}
