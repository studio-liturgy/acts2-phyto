// "Reference per slide" for scripture: every fetched verse slide remembers the
// verses it holds ("1:1-2", chapter-qualified, in the primary version's
// numbering), and a set with the setting on shows "John 1:1-2" on the slide
// instead of the passage's "John 1". The passage reference itself never
// changes: it still names the import in the editor, the presenter's grid and
// the phone view.
import { splitRefLabel } from "./bible";
import { plainLength } from "./inline-format";
import type { VerseRow } from "./slide-text";
import type { Slide } from "./types";

/** A passage as fetched: its verses in order. */
export type FetchedPassage = (VersePos & { text: string })[];

interface VersePos {
  chapter: number;
  verse: number;
}

/** "1:1", "1:1-2" or "3:36-4:1" for the verses (in order) on one slide. */
export function verseRange(verses: VersePos[]): string | undefined {
  if (!verses.length) return undefined;
  const a = verses[0];
  const b = verses[verses.length - 1];
  return formatRange(a.chapter, a.verse, b.chapter, b.verse);
}

function formatRange(sc: number, sv: number, ec: number, ev: number): string {
  if (sc === ec) return sv === ev ? `${sc}:${sv}` : `${sc}:${sv}-${ev}`;
  return `${sc}:${sv}-${ec}:${ev}`;
}

const RANGE_RE = /^(\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/;

function parseRange(r: string): { sc: number; sv: number; ec: number; ev: number } | null {
  const m = RANGE_RE.exec(r.trim());
  if (!m) return null;
  const sc = Number(m[1]);
  const sv = Number(m[2]);
  const ec = m[3] ? Number(m[3]) : sc;
  const ev = m[4] ? Number(m[4]) : sv;
  return { sc, sv, ec, ev };
}

/** Two slides' verses joined into one: from the first's start to the second's
 *  end. Either side missing gives the other. */
export function spanRanges(a?: string, b?: string): string | undefined {
  if (!a || !b) return a || b || undefined;
  const x = parseRange(a);
  const y = parseRange(b);
  if (!x || !y) return a;
  return formatRange(x.sc, x.sv, y.ec, y.ev);
}

/** The book part of a bare passage reference: "1 John" for "1 John 3:1-2",
 *  "約翰福音" for "約翰福音 1". Null when it doesn't end in chapter/verse. */
export function passageBook(ref: string): string | null {
  const m = /^(.*?\S)\s*\d+(?::\d+)?(?:\s*[-–]\s*\d+(?::\d+)?)?$/u.exec(ref.trim());
  return m ? m[1] : null;
}

/** The passage reference ("John 1 NIV") narrowed to one slide's verses
 *  ("John 1:1-2 NIV"); the version label, if any, stays as it was. */
export function perSlideReference(passageRef: string, verses: string): string {
  const label = passageRef.trim();
  const { ref } = splitRefLabel(label);
  const book = passageBook(ref);
  if (!book || !parseRange(verses)) return passageRef;
  return `${book} ${verses}${label.slice(ref.length)}`;
}

/** What a scripture slide shows as its reference: the passage's, or this
 *  slide's own verses when its set has "Reference per slide" on. */
export function shownReference(
  ref: string | undefined,
  slide: Pick<Slide, "verses" | "refPerSlide" | "manual">,
): string | undefined {
  if (!ref || !slide.refPerSlide || !slide.verses || slide.manual) return ref;
  return perSlideReference(ref, slide.verses);
}

/** The line a verse block carries its verses on in the scripture text boxes
 *  ("{1:1-2}"), just under its `[ref]` header. Never shown: the editors
 *  render rows parsed from the text. */
export function verseTag(verses: string): string {
  return `{${verses}}`;
}

/** A verse tag line's range, or null when the line isn't one. */
export function parseVerseTag(line: string): string | null {
  const m = /^\s*\{(\d+:\d+(?:-(?:\d+:)?\d+)?)\}\s*$/.exec(line);
  return m ? m[1] : null;
}

/**
 * Which fetched verses each block of text holds, for passages imported before
 * blocks remembered their verses. Blocks may since have been joined, split or
 * edited, so they're matched by position along the passage: the blocks' and
 * the verses' text lengths are laid end to end, a verse goes to the block its
 * middle falls in, and a block that gets none (a short split-off half) takes
 * the verse under its own middle. Exact for untouched imports.
 */
export function assignVerses(
  blockTexts: string[],
  verses: (VersePos & { text: string })[],
): (string | undefined)[] {
  if (!blockTexts.length || !verses.length) return blockTexts.map(() => undefined);
  const len = (s: string) => Math.max(0, plainLength(s.replace(/\s+/g, " ").trim()));
  const spans = (lens: number[]) => {
    const total = lens.reduce((a, b) => a + b, 0) || 1;
    let at = 0;
    return lens.map((l) => {
      const start = at / total;
      at += l;
      return [start, at / total] as const;
    });
  };
  // Blank blocks still get a sliver, so they land somewhere.
  const blocks = spans(blockTexts.map((t) => len(t) + 1));
  const vs = spans(verses.map((v) => len(v.text) + 1));
  const blockAt = (x: number) => {
    const i = blocks.findIndex(([, end]) => x < end);
    return i === -1 ? blocks.length - 1 : i;
  };
  const verseAt = (x: number) => {
    const i = vs.findIndex(([, end]) => x < end);
    return i === -1 ? vs.length - 1 : i;
  };
  const got: number[][] = blockTexts.map(() => []);
  vs.forEach(([s, e], i) => got[blockAt((s + e) / 2)].push(i));
  return got.map((idx, b) => {
    if (!idx.length) idx = [verseAt((blocks[b][0] + blocks[b][1]) / 2)];
    return verseRange([verses[Math.min(...idx)], verses[Math.max(...idx)]]);
  });
}

/** The imports among the rows (a group opens at each `starts`), as
 *  [first, end) index pairs. */
function rowGroups(rows: VerseRow[]): [number, number][] {
  const out: [number, number][] = [];
  rows.forEach((r, i) => {
    if (r.starts || out.length === 0) out.push([i, i + 1]);
    else out[out.length - 1][1] = i + 1;
  });
  return out;
}

/** The passage labels ("John 1 NIV") of the fetched imports that have a row
 *  without its verses: what turning "Reference per slide" on must fetch. */
export function rowPassagesMissingVerses(rows: VerseRow[], primary: string): string[] {
  const out = new Set<string>();
  for (const [a, b] of rowGroups(rows)) {
    const group = rows.slice(a, b);
    const label = group[0].refs[primary]?.trim();
    if (!group[0].manual && label && group.some((r) => !r.verses)) out.add(label);
  }
  return [...out];
}

/** The rows with each such import's verses filled in from its fetched
 *  passage (keyed by label), matched to the rows by assignVerses. Imports
 *  that already know their verses, or weren't fetched, are left as they are. */
export function fillRowVerses(
  rows: VerseRow[],
  primary: string,
  fetched: Map<string, FetchedPassage>,
): VerseRow[] {
  const next = rows.slice();
  for (const [a, b] of rowGroups(rows)) {
    const group = rows.slice(a, b);
    const passage = fetched.get(group[0].refs[primary]?.trim() ?? "");
    if (group[0].manual || !passage || group.every((r) => r.verses)) continue;
    const got = assignVerses(
      group.map((r) => r.text[primary] ?? ""),
      passage,
    );
    got.forEach((verses, k) => {
      if (verses) next[a + k] = { ...rows[a + k], verses };
    });
  }
  return next;
}

/** A message's verse blocks: runs of fetched scripture slides from one
 *  import, as [first, end) index pairs. */
function slideRuns(slides: Slide[]): [number, number][] {
  const out: [number, number][] = [];
  slides.forEach((s, i) => {
    if (s.kind !== "scripture" || s.manual) return;
    const last = out[out.length - 1];
    if (last && last[1] === i && slides[i - 1].importIndex === s.importIndex) last[1] = i + 1;
    else out.push([i, i + 1]);
  });
  return out;
}

/** A message slide's passage label, as its block was imported. */
export function slidePassage(s: Slide): string {
  return (s.reference ?? Object.values(s.referencesByVersion ?? {})[0] ?? "").trim();
}

/** As rowPassagesMissingVerses, for a message's slides. */
export function slidePassagesMissingVerses(slides: Slide[]): string[] {
  const out = new Set<string>();
  for (const [a, b] of slideRuns(slides)) {
    const run = slides.slice(a, b);
    const label = slidePassage(run[0]);
    if (label && run.some((s) => !s.verses)) out.add(label);
  }
  return [...out];
}

/** As fillRowVerses, for a message's slides; `primary` is the version whose
 *  text is matched against the passage. */
export function fillSlideVerses(
  slides: Slide[],
  primary: string,
  fetched: Map<string, FetchedPassage>,
): Slide[] {
  const next = slides.slice();
  for (const [a, b] of slideRuns(slides)) {
    const run = slides.slice(a, b);
    const passage = fetched.get(slidePassage(run[0]));
    if (!passage || run.every((s) => s.verses)) continue;
    const got = assignVerses(
      run.map((s) => s.linesByVersion?.[primary] ?? (s.lines ?? []).join("\n")),
      passage,
    );
    got.forEach((verses, k) => {
      if (verses) next[a + k] = { ...slides[a + k], verses };
    });
  }
  return next;
}

/** A scripture slide marked to show its own verses, or not. */
export function withRefPerSlide(s: Slide, on: boolean): Slide {
  if (on) return s.refPerSlide ? s : { ...s, refPerSlide: true };
  if (!s.refPerSlide) return s;
  const { refPerSlide: _off, ...rest } = s;
  return rest;
}
