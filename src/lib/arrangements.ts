// Song arrangements (Settings → Arrangements). Per gathering, a song can be
// played in any order of its sections, with repeats: an arrangement is an
// ordered list of the stable section keys from `groupSlides` ("Chorus#0").
// Removing a section only takes it out of the list (its slides are hidden from
// view in that gathering); the song's content is never touched.
//
// Shared by the presenter grid, live navigation and the phone viewer so they
// all agree on the order.

import { groupSlides, type SectionSlide, type SlideGroup } from "./sections";

export type Arrangement = string[];

export interface ArrangedEntry<T extends SectionSlide = SectionSlide> {
  /** The section this entry plays. */
  group: SlideGroup<T>;
  /** Which repeat of this section key this entry is (0 = first). */
  repeat: number;
  /** Unique per entry, for React keys and the pill row. */
  entryKey: string;
}

/** Where a slide sits in the arranged run: its id plus which appearance of
 *  that id it is (a repeated chorus plays the same slide ids twice). */
export interface ArrangedPos {
  slideId: string;
  occ: number;
}

/** The arrangement a song starts from: the written order, minus the sections
 *  hidden with the eye. Never empty: if every key would be dropped (stale hides)
 *  it falls back to every section. */
export function defaultArrangement(slides: SectionSlide[], hiddenKeys: string[] = []): Arrangement {
  const all = groupSlides(slides).map((g) => g.key);
  const hidden = new Set(hiddenKeys);
  const kept = all.filter((k) => !hidden.has(k));
  return kept.length > 0 ? kept : all;
}

/** The arrangement to use: the stored one with keys that no longer match a
 *  section dropped (the song was edited), or the default when nothing stored
 *  survives. */
export function effectiveArrangement(
  slides: SectionSlide[],
  stored: Arrangement | undefined,
  hiddenKeys: string[] = [],
): Arrangement {
  const keys = new Set(groupSlides(slides).map((g) => g.key));
  const valid = (stored ?? []).filter((k) => keys.has(k));
  return valid.length > 0 ? valid : defaultArrangement(slides, hiddenKeys);
}

/** The arrangement's sections in play order, repeats included. Keys that no
 *  longer match a section are skipped. */
export function arrangedEntries<T extends SectionSlide>(
  slides: T[],
  arrangement: Arrangement,
): ArrangedEntry<T>[] {
  const byKey = new Map(groupSlides(slides).map((g) => [g.key, g]));
  const seen = new Map<string, number>();
  const out: ArrangedEntry<T>[] = [];
  for (const key of arrangement) {
    const group = byKey.get(key);
    if (!group) continue;
    const repeat = seen.get(key) ?? 0;
    seen.set(key, repeat + 1);
    out.push({ group, repeat, entryKey: `${key}@${repeat}` });
  }
  return out;
}

/** The arranged run as slide positions. `occ` counts earlier appearances of the
 *  same slide id, so the second chorus is occ 1. Slides without an id are
 *  skipped (they can't go live). */
export function arrangedSequence(slides: SectionSlide[], arrangement: Arrangement): ArrangedPos[] {
  const occ = new Map<string, number>();
  const out: ArrangedPos[] = [];
  for (const e of arrangedEntries(slides, arrangement)) {
    for (const { slide } of e.group.items) {
      if (!slide.id) continue;
      const n = occ.get(slide.id) ?? 0;
      occ.set(slide.id, n + 1);
      out.push({ slideId: slide.id, occ: n });
    }
  }
  return out;
}

/** The position one step forward (+1) or back (-1) from `current` in the
 *  arranged run, or null at either end. When `current` isn't in the run (the
 *  live slide's section was removed meanwhile), it steps to the nearest
 *  arranged slide by written order, the way the eye skips hidden slides. */
export function stepArranged(
  slides: SectionSlide[],
  seq: ArrangedPos[],
  current: ArrangedPos,
  dir: 1 | -1,
): ArrangedPos | null {
  const i = seq.findIndex((p) => p.slideId === current.slideId && p.occ === current.occ);
  if (i >= 0) return seq[i + dir] ?? null;
  // Same slide, other repeat (occ out of range after an edit): step from its
  // last/first appearance.
  const same = seq.map((p, j) => (p.slideId === current.slideId ? j : -1)).filter((j) => j >= 0);
  if (same.length > 0) {
    const j = dir === 1 ? same[same.length - 1] : same[0];
    return seq[j + dir] ?? null;
  }
  const written = new Map(slides.map((s, j) => [s.id, j]));
  const at = written.get(current.slideId);
  if (at === undefined) return null;
  if (dir === 1) return seq.find((p) => (written.get(p.slideId) ?? -1) > at) ?? null;
  for (let j = seq.length - 1; j >= 0; j--) {
    if ((written.get(seq[j].slideId) ?? Infinity) < at) return seq[j];
  }
  return null;
}

/** 1-based place of `current` in the arranged run, or null when it isn't in it. */
export function arrangedPlace(seq: ArrangedPos[], current: ArrangedPos): number | null {
  const i = seq.findIndex((p) => p.slideId === current.slideId && p.occ === current.occ);
  return i >= 0 ? i + 1 : null;
}

/** Remove the entry at `index`. Null when it's the last one: a song keeps at
 *  least one section, the same rule as hiding with the eye. */
export function removeEntry(arrangement: Arrangement, index: number): Arrangement | null {
  if (arrangement.length <= 1 || index < 0 || index >= arrangement.length) return null;
  return arrangement.filter((_, i) => i !== index);
}

/** Move the entry at `from` so it lands at `to`. */
export function moveEntry(arrangement: Arrangement, from: number, to: number): Arrangement {
  if (from === to || from < 0 || from >= arrangement.length) return arrangement;
  const next = arrangement.slice();
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

/** Add a section to the end (repeats allowed). */
export function addEntry(arrangement: Arrangement, key: string): Arrangement {
  return [...arrangement, key];
}

export interface SectionOption {
  key: string;
  label: string;
  /** Written position of the section (0-based), for its colour. */
  index: number;
}

/** The song's written sections as pill/menu options. A label the song uses
 *  twice gets its number ("Chorus", "Chorus (2)") so the two stay apart;
 *  an unlabeled section reads "Untitled". */
export function sectionOptions(slides: SectionSlide[]): SectionOption[] {
  const groups = groupSlides(slides);
  const total = new Map<string, number>();
  for (const g of groups) total.set(g.section ?? "", (total.get(g.section ?? "") ?? 0) + 1);
  const seen = new Map<string, number>();
  return groups.map((g, index) => {
    const name = g.section ?? "";
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    const base = name || "Untitled";
    return { key: g.key, label: (total.get(name) ?? 0) > 1 ? `${base} (${n})` : base, index };
  });
}

/** True when the arrangement is just the written order with nothing removed or
 *  repeated, so there's no need to store it. */
export function isWrittenOrder(slides: SectionSlide[], arrangement: Arrangement): boolean {
  const all = groupSlides(slides).map((g) => g.key);
  return all.length === arrangement.length && all.every((k, i) => k === arrangement[i]);
}
