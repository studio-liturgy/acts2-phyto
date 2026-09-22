// Section grouping shared by the presenter grid (present.tsx) and the phone
// viewer (PhoneViewer / g.$token). Both must derive the SAME stable section
// keys, otherwise a section the leader hides in the presenter can't be matched
// and removed on the congregant's phone. Keep this the single source of truth.

/** Minimal slide shape the grouping needs. Both the app's `Slide` and the
 *  viewer's raw Supabase `SlideRow` satisfy it. */
export interface SectionSlide {
  id?: string;
  kind?: string;
  section?: string;
  reference?: string;
  /** which scripture import this verse came from, so a message groups by
   *  import (and colours per block) rather than by shared reference text. */
  importIndex?: number;
  /** Media: a section divider (with this label) sits right AFTER this slide,
   *  so the slides that follow belong to a new section. */
  sectionAfter?: string;
  /** Media, first slide: the first section's name. */
  sectionBefore?: string;
}

export interface SlideGroup<T extends SectionSlide = SectionSlide> {
  /** Resolved section label for the group; null when unlabeled. */
  section: string | null;
  /** Stable identity for section-hiding and React keys: the resolved label plus
   *  its occurrence index (e.g. "Chorus#0", "Verse 2#0", "§none#0"). Unlike a
   *  slide id, this survives the slide-id regeneration that happens when a
   *  song/scripture set is edited, so a hidden section stays hidden. */
  key: string;
  items: { slide: T; index: number }[];
}

const SECTION_RE =
  /^\s*\[?(verse\s*\d*|chorus|bridge|pre[- ]?chorus|intro|outro|tag|interlude|refrain)\]?:?\s*$/i;

export function sectionOf(s: SectionSlide): string | null {
  if (s.section && s.section.trim()) return s.section.trim();
  if (s.kind === "lyric" && s.reference && SECTION_RE.test(s.reference)) {
    return s.reference.trim();
  }
  return null;
}

/** Group consecutive slides by their resolved section, the same way the
 *  presenter grid renders them. Shared so every surface agrees on keys. */
export function groupSlides<T extends SectionSlide>(slides: T[]): SlideGroup<T>[] {
  const groups: SlideGroup<T>[] = [];
  let currentSection: string | null = null;
  let lastBlockKey: string | null = null;
  // Media sections come from dividers between slides rather than a label on
  // each slide: a divider after slide N opens a new section at N+1.
  let dividerSection: string | null | undefined =
    slides[0]?.sectionBefore !== undefined ? slides[0].sectionBefore.trim() || null : undefined;
  let mediaSectionNo = 0;
  slides.forEach((s, i) => {
    const sec = sectionOf(s) ?? dividerSection ?? null;
    const resolvedSection = sec ?? currentSection;
    // A block is: one scripture import (by importIndex), a run of consecutive
    // points/images together, or a run of one section (songs). This keeps a
    // message coloured the same way in the presenter, the phone and the editor.
    const blockKey =
      s.kind === "scripture" && s.importIndex !== undefined
        ? `import:${s.importIndex}`
        : s.kind === "point" || s.kind === "image" || s.kind === "video" || s.kind === "blank"
          ? dividerSection !== undefined
            ? `media:${mediaSectionNo}`
            : "elements"
          : `sec:${resolvedSection ?? ""}`;
    const last = groups[groups.length - 1];
    if (!last || blockKey !== lastBlockKey) {
      groups.push({ section: resolvedSection, key: "", items: [{ slide: s, index: i }] });
      currentSection = resolvedSection;
    } else {
      last.items.push({ slide: s, index: i });
    }
    lastBlockKey = blockKey;
    if (s.sectionAfter !== undefined) {
      // Everything after this slide is a new (media) section.
      dividerSection = s.sectionAfter.trim() || null;
      mediaSectionNo += 1;
      currentSection = null;
    }
  });
  // Assign stable keys: label + per-label occurrence index, so two distinct
  // "Chorus" sections stay independently hideable.
  const seen = new Map<string, number>();
  for (const g of groups) {
    const label = g.section ?? "§none";
    const n = seen.get(label) ?? 0;
    seen.set(label, n + 1);
    g.key = `${label}#${n}`;
  }
  return groups;
}

/** Slide ids belonging to the hidden section groups (identified by stable key). */
export function hiddenSlideIds(slides: SectionSlide[], hiddenKeys: string[]): Set<string> {
  const ids = new Set<string>();
  if (hiddenKeys.length === 0) return ids;
  const keys = new Set(hiddenKeys);
  for (const g of groupSlides(slides)) {
    if (keys.has(g.key)) for (const it of g.items) if (it.slide.id) ids.add(it.slide.id);
  }
  return ids;
}

/** Slide indices belonging to the hidden section groups. Index-based so it works
 *  even for slides that carry no id (e.g. raw viewer rows). */
export function hiddenSlideIndices(slides: SectionSlide[], hiddenKeys: string[]): Set<number> {
  const idx = new Set<number>();
  if (hiddenKeys.length === 0) return idx;
  const keys = new Set(hiddenKeys);
  for (const g of groupSlides(slides)) {
    if (keys.has(g.key)) for (const it of g.items) idx.add(it.index);
  }
  return idx;
}

/**
 * The one slide a single drag moved: the slide whose removal leaves the two
 * orders identical. Undefined when the orders match or differ by more than
 * one move.
 */
export function movedSlideId<T extends { id?: string }>(
  before: T[],
  after: T[],
): string | undefined {
  const ids = (list: T[], skip: string) => list.map((s) => s.id).filter((id) => id !== skip);
  for (const s of after) {
    if (!s.id) continue;
    const a = ids(after, s.id);
    const b = ids(before, s.id);
    if (a.length === b.length && a.every((id, i) => id === b[i])) return s.id;
  }
  return undefined;
}

/**
 * Media sections after one slide moved. A divider sits after the last slide
 * of its section, so a slide dropped between two others joins their section
 * and the sections around it grow or shrink to fit. When the moved slide is
 * the one carrying a divider, the divider stays behind on the slide that was
 * before it (the section's new last slide) rather than travelling along and
 * sweeping every slide up to the drop point into that section; a section the
 * moved slide had to itself simply closes. The first section's name stays on
 * whichever slide is first.
 */
export function moveSlideKeepingSections<T extends SectionSlide>(
  before: T[],
  after: T[],
  movedId: string | undefined = movedSlideId(before, after),
): T[] {
  let out = after;
  const from = movedId ? before.findIndex((s) => s.id === movedId) : -1;
  if (from >= 0 && before[from].sectionAfter !== undefined) {
    const name = before[from].sectionAfter;
    const prev = from > 0 ? before[from - 1] : undefined;
    out = out.map((s) => {
      if (s.id === movedId) {
        const { sectionAfter: _drop, ...rest } = s;
        return rest as T;
      }
      // The divider stays on the slide before, unless that one already closes
      // a section (the moved slide was a section by itself, now gone).
      if (prev && s.id === prev.id && prev.sectionAfter === undefined) {
        return { ...s, sectionAfter: name };
      }
      return s;
    });
  }
  // A divider after the very last slide would open an empty section: drop it.
  out = out.map((s, i) =>
    i === out.length - 1 && s.sectionAfter !== undefined
      ? (({ sectionAfter: _drop, ...rest }) => rest as T)(s)
      : s,
  );
  // The first section's name lives on the first slide.
  const firstName = before[0]?.sectionBefore;
  return out.map((s, i) => {
    const { sectionBefore: _b, ...rest } = s;
    const o = rest as T;
    if (i === 0 && firstName !== undefined) o.sectionBefore = firstName;
    return o;
  });
}
