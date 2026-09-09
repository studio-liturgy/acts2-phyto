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
  slides.forEach((s, i) => {
    const sec = sectionOf(s);
    const resolvedSection = sec ?? currentSection;
    const last = groups[groups.length - 1];
    if (!last || resolvedSection !== currentSection) {
      groups.push({ section: resolvedSection, key: "", items: [{ slide: s, index: i }] });
      currentSection = resolvedSection;
    } else {
      last.items.push({ slide: s, index: i });
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
