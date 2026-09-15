// Pure text ⇄ slides conversions for the song/scripture editors, plus the
// id-preserving reconcile that keeps the round-trip write-free. Extracted from
// set.$setId.tsx so the editor and the unit tests share one implementation.
import type { Slide } from "./types";
import { stableStringify } from "./sync";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// Parses lyrics using only --- as slide breaks, never re-splitting by linesPer.
// Lines matching /^\[.+\]$/ set the current group label for following slides.
// Used for the live right-column preview on every keystroke.
export function parseLyricsFromText(text: string): Slide[] {
  const rawLines = text.split("\n");
  const slides: Slide[] = [];
  let currentSection: string | undefined;
  let currentLines: string[] = [];

  const flushSlide = () => {
    const content = currentLines.join("\n").trim();
    if (content) {
      slides.push({
        id: uid(),
        kind: "lyric" as const,
        lines: content
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
        section: currentSection,
      });
    }
    currentLines = [];
  };

  for (const line of rawLines) {
    if (/^---\s*$/.test(line)) {
      flushSlide();
    } else if (/^\[.+\]$/.test(line.trim())) {
      flushSlide();
      currentSection = line.trim().slice(1, -1);
    } else {
      currentLines.push(line);
    }
  }
  flushSlide();
  return slides;
}

export function lyricsToSlides(text: string): Slide[] {
  return parseLyricsFromText(text);
}

// Parses scripture textarea format into slides.
// Lines matching /^\[.+\]$/ set the current verse reference.
// --- forces a slide boundary; versesPer groups verses within each segment.
// Segments with no [ref] inherit the last seen ref from previous segments.
export function parseScriptureFromText(text: string, versesPer: number): Slide[] {
  const segments = text.split(/^---\s*$/m);
  const slides: Slide[] = [];
  let inheritedRef = "";

  for (const segment of segments) {
    const verses: { ref: string; lines: string[] }[] = [];
    let currentRef = inheritedRef;
    let currentLines: string[] = [];

    const flushVerse = () => {
      const content = currentLines.join("\n").trim();
      if (content || currentRef) {
        verses.push({ ref: currentRef, lines: content ? content.split("\n") : [] });
      }
      currentLines = [];
    };

    for (const line of segment.split("\n")) {
      if (/^\[.+\]$/.test(line.trim())) {
        flushVerse();
        currentRef = line.trim().slice(1, -1);
        inheritedRef = currentRef;
      } else {
        currentLines.push(line);
      }
    }
    flushVerse();

    for (let i = 0; i < verses.length; i += versesPer) {
      const group = verses.slice(i, i + versesPer);
      const lines = group.flatMap((v) => v.lines);
      if (lines.length === 0) continue;
      slides.push({
        id: uid(),
        kind: "scripture" as const,
        reference: group[0].ref,
        lines,
        section: group[0].ref,
      });
    }
  }
  return slides;
}

/** Rebuild the lyrics-textarea text from stored slides: `[section]` headers
 *  where the section changes, slides joined by `---`. Inverse of
 *  parseLyricsFromText on its own output. */
export function slidesToLyricsText(slides: Slide[]): string {
  let prevSection: string | undefined;
  const parts: string[] = [];
  for (const s of slides) {
    if (s.section !== prevSection) {
      if (s.section) parts.push(`[${s.section}]`);
      prevSection = s.section;
    }
    parts.push(s.lines?.join("\n") ?? "");
  }
  return parts.join("\n---\n");
}

/** Rebuild the scripture-textarea text from stored slides: `[ref]` headers
 *  where the reference changes, slides joined by `---`. Inverse of
 *  parseScriptureFromText on its own output. */
export function slidesToScriptureText(slides: Slide[]): string {
  const slideParts: string[] = [];
  let lastRef = "";
  for (const s of slides) {
    const ref = s.reference ?? "";
    const text = (s.lines ?? []).join("\n");
    slideParts.push(ref !== lastRef ? `[${ref}]\n${text}` : text);
    lastRef = ref;
  }
  return slideParts.join("\n---\n");
}

const slideContentKey = (s: Slide) => stableStringify({ ...s, id: undefined });

/**
 * Positionally reconcile freshly-parsed slides (random new ids) against the
 * stored ones: where the content at an index is identical, keep the STORED
 * slide object — preserving its id. `changed` is false iff every slide was
 * preserved, i.e. the parse round-trip produced no effective change.
 *
 * This is what keeps "open the editor, touch nothing" from writing: new slide
 * ids change the sync fingerprint (sync.ts setFingerprint) and would flag a
 * phantom conflict on every other device.
 */
export function reconcileSlideIds(
  parsed: Slide[],
  current: Slide[],
): { slides: Slide[]; changed: boolean } {
  let changed = parsed.length !== current.length;
  const slides = parsed.map((p, i) => {
    if (i < current.length && slideContentKey(p) === slideContentKey(current[i])) {
      return current[i];
    }
    changed = true;
    return p;
  });
  return { slides, changed };
}

/** Split one scripture box into its `---`-separated verse blocks, pulling a
 *  leading `[ref]` header off each. */
function scriptureSegments(text: string): { ref?: string; text: string }[] {
  return text.split(/^---\s*$/m).map((seg) => {
    let ref: string | undefined;
    let sawContent = false;
    const body: string[] = [];
    for (const line of seg.split("\n")) {
      const m = /^\s*\[(.+)\]\s*$/.exec(line);
      // The [ref] header may sit behind the blank line that the --- split
      // leaves at the top of a segment, so ignore leading blanks when finding it.
      if (m && ref === undefined && !sawContent) {
        ref = m[1].trim();
        continue;
      }
      if (line.trim()) sawContent = true;
      body.push(line);
    }
    return { ref, text: body.join("\n").trim() };
  });
}

/** One editable verse across the versions, for the row-based scripture editor:
 *  the aligned block at a position, its reference per version, and its text.
 *  `starts` marks the first verse of an import — the boundary the editor groups
 *  on, so importing the same passage twice makes two groups, not one merged one
 *  (a group can't be detected from the reference value alone, since a re-import
 *  repeats it). It's carried by the primary version's explicit `[ref]` header. */
export interface VerseRow {
  refs: Record<string, string | undefined>;
  text: Record<string, string>;
  starts: boolean;
}

/** Parse the version boxes into aligned verse rows (so the editor can draw a
 *  divider between verses instead of a literal "---"). */
export function toVerseRows(byVersionText: Record<string, string>, versions: string[]): VerseRow[] {
  const primary = versions[0];
  const segs: Record<string, { ref?: string; text: string }[]> = {};
  for (const v of versions) segs[v] = scriptureSegments(byVersionText[v] ?? "");
  const count = Math.max(...versions.map((v) => segs[v].length), 0);
  const rows: VerseRow[] = [];
  const lastRef: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const refs: Record<string, string | undefined> = {};
    const text: Record<string, string> = {};
    for (const v of versions) {
      const s = segs[v][i];
      if (s?.ref) lastRef[v] = s.ref;
      refs[v] = s?.ref ?? lastRef[v];
      text[v] = s?.text ?? "";
    }
    // A verse begins a new import when its primary box carries an explicit
    // header; the very first verse always begins one.
    rows.push({ refs, text, starts: i === 0 || segs[primary][i]?.ref !== undefined });
  }
  return rows;
}

/** Serialize verse rows back to the version boxes. Inverse of toVerseRows.
 *  A `[ref]` header is written only on the verses that begin an import, so the
 *  round-trip preserves import boundaries instead of stamping a header on every
 *  verse (which would then read back as one import per verse). */
export function fromVerseRows(rows: VerseRow[], versions: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of versions) {
    out[v] = rows
      .map((r) => (r.starts && r.refs[v] ? `[${r.refs[v]}]\n${r.text[v]}` : r.text[v]))
      .join("\n---\n");
  }
  return out;
}
