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
  // Every `[ref]` header opens a new import (the message block editor groups
  // verses by it); the verses that follow inherit the header's reference and,
  // for a `[~ref]` header, its hand-typed status. Counted from the headers so
  // the same passage imported twice stays two imports; slidesToScriptureText
  // writes a header at every import boundary so this survives the round-trip.
  let importIndex = -1;
  let manual = false;

  for (const segment of segments) {
    const verses: { ref: string; lines: string[]; importIndex: number; manual: boolean }[] = [];
    let currentRef = inheritedRef;
    let currentLines: string[] = [];

    const flushVerse = () => {
      const content = currentLines.join("\n").trim();
      if (content || currentRef) {
        verses.push({
          ref: currentRef,
          lines: content ? content.split("\n") : [],
          importIndex: Math.max(0, importIndex),
          manual,
        });
      }
      currentLines = [];
    };

    for (const line of segment.split("\n")) {
      const h = parseScriptureHeader(line);
      if (h) {
        flushVerse();
        currentRef = h.ref;
        inheritedRef = currentRef;
        importIndex += 1;
        manual = h.manual;
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
        reference: group[0].ref.trim() || undefined,
        lines,
        section: group[0].ref.trim() || undefined,
        importIndex: group[0].importIndex,
        ...(group[0].manual ? { manual: true } : {}),
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
  let lastImportIndex: number | undefined;
  for (const s of slides) {
    const ref = s.reference ?? "";
    const text = (s.lines ?? []).join("\n");
    // A header at every import boundary (and, for slides that predate
    // importIndex, wherever the reference changes).
    const boundary =
      s.importIndex !== undefined && lastImportIndex !== undefined
        ? s.importIndex !== lastImportIndex
        : ref !== lastRef || slideParts.length === 0;
    const header = boundary ? scriptureHeader(ref, s.manual) : "";
    slideParts.push(header ? `${header}\n${text}` : text);
    lastRef = ref;
    lastImportIndex = s.importIndex;
  }
  return slideParts.join("\n---\n");
}

/**
 * The two-version scripture editor: one text box per translation, paired by
 * slide position (each `---` block is the same verse in every version). Only the
 * first version carries the `[ref]` headers; the others are plain, so they line
 * up by position exactly like the multilingual song boxes.
 */
export function slidesToVersionText(slides: Slide[], versions: string[]): Record<string, string> {
  const primary = versions[0];
  const out: Record<string, string[]> = {};
  const lastRef: Record<string, string> = {};
  for (const v of versions) out[v] = [];
  // A header is written at every import boundary (importIndex change), not only
  // when the reference text changes, so two imports of the same passage stay two
  // separate blocks when the boxes are rebuilt from the stored slides.
  let lastImportIndex: number | undefined;
  for (const s of slides) {
    const boundary = s.importIndex !== undefined && s.importIndex !== lastImportIndex;
    for (const v of versions) {
      // Each box carries its own (localized) reference header. A hand-typed
      // verse's versions have only what was typed for each: no falling back to
      // the primary's reference.
      const ref =
        s.referencesByVersion?.[v] ?? (s.manual && v !== primary ? "" : (s.reference ?? ""));
      const text = s.linesByVersion?.[v] ?? (v === primary ? (s.lines ?? []).join("\n") : "");
      const header = boundary || (ref && ref !== lastRef[v]) ? scriptureHeader(ref, s.manual) : "";
      out[v].push(header ? `${header}\n${text}` : text);
      lastRef[v] = ref;
    }
    lastImportIndex = s.importIndex;
  }
  const res: Record<string, string> = {};
  for (const v of versions) res[v] = out[v].join("\n---\n");
  return res;
}

/**
 * The `[ref]` header that opens an import in the scripture text. A verse typed
 * in by hand (never fetched) opens with `[~ref]` instead, `[~]` when it has no
 * reference yet: the marker keeps it apart from fetched passages when the
 * set's versions are re-fetched, and lets a blank reference still start a
 * block (a bare `[]` would read as text). Never shown: the editors render
 * references from the parsed rows.
 */
export function scriptureHeader(ref: string | undefined, manual?: boolean): string {
  return manual ? `[~${ref ?? ""}]` : ref ? `[${ref}]` : "";
}

/** A header line's contents, or null when the line isn't one. */
export function parseScriptureHeader(line: string): { ref: string; manual: boolean } | null {
  const m = /^\s*\[(.+)\]\s*$/.exec(line);
  if (!m) return null;
  const inner = m[1].trim();
  // A manual reference keeps its trailing space: the editor re-parses the box
  // on every keystroke, and trimming here would eat the space just typed.
  return inner.startsWith("~")
    ? { ref: m[1].replace(/^\s*~/, "").trimStart(), manual: true }
    : { ref: inner, manual: false };
}

/** Split one scripture box into its `---`-separated verse blocks, pulling a
 *  leading `[ref]` (or manual `[~ref]`) header off each. */
function scriptureSegments(text: string): { ref?: string; manual?: boolean; text: string }[] {
  return text.split(/^---\s*$/m).map((seg) => {
    let ref: string | undefined;
    let manual: boolean | undefined;
    let sawContent = false;
    const body: string[] = [];
    for (const line of seg.split("\n")) {
      const h = parseScriptureHeader(line);
      // The [ref] header may sit behind the blank line that the --- split
      // leaves at the top of a segment, so ignore leading blanks when finding it.
      if (h && ref === undefined && !sawContent) {
        ref = h.ref;
        if (h.manual) manual = true;
        continue;
      }
      if (line.trim()) sawContent = true;
      body.push(line);
    }
    return { ref, manual, text: body.join("\n").trim() };
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
  /** The import this verse belongs to was typed in by hand (see scriptureHeader). */
  manual?: boolean;
}

/** Parse the version boxes into aligned verse rows (so the editor can draw a
 *  divider between verses instead of a literal "---"). */
export function toVerseRows(byVersionText: Record<string, string>, versions: string[]): VerseRow[] {
  const primary = versions[0];
  const segs: Record<string, { ref?: string; manual?: boolean; text: string }[]> = {};
  for (const v of versions) segs[v] = scriptureSegments(byVersionText[v] ?? "");
  const count = Math.max(...versions.map((v) => segs[v].length), 0);
  const rows: VerseRow[] = [];
  const lastRef: Record<string, string> = {};
  let manual = false;
  for (let i = 0; i < count; i++) {
    const refs: Record<string, string | undefined> = {};
    const text: Record<string, string> = {};
    for (const v of versions) {
      const s = segs[v][i];
      // A header (even an empty manual one) resets the running reference, so a
      // hand-typed verse after a passage doesn't inherit the passage's.
      if (s?.ref !== undefined) lastRef[v] = s.ref;
      refs[v] = s?.ref ?? lastRef[v];
      text[v] = s?.text ?? "";
    }
    // A verse begins a new import when its primary box carries an explicit
    // header; the very first verse always begins one.
    const starts = i === 0 || segs[primary][i]?.ref !== undefined;
    if (starts) manual = !!segs[primary][i]?.manual;
    rows.push({ refs, text, starts, ...(manual ? { manual } : {}) });
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
      .map((r) => {
        const header = r.starts ? scriptureHeader(r.refs[v], r.manual) : "";
        return header ? `${header}\n${r.text[v]}` : r.text[v];
      })
      .join("\n---\n");
  }
  return out;
}

/** Inverse of slidesToVersionText: pair the per-version boxes into one slide per
 *  block by position, taking references from the first version's headers. */
export function versionTextToSlides(
  byVersionText: Record<string, string>,
  versions: string[],
): Slide[] {
  const primary = versions[0];
  const segsByVersion: Record<string, { ref?: string; manual?: boolean; text: string }[]> = {};
  for (const v of versions) segsByVersion[v] = scriptureSegments(byVersionText[v] ?? "");
  const count = Math.max(...versions.map((v) => segsByVersion[v].length), 0);

  const slides: Slide[] = [];
  const lastRef: Record<string, string> = {};
  // Each explicit primary header opens a new import; importIndex separates two
  // imports of the same reference, which a shared `section`/`reference` cannot.
  let importIndex = -1;
  let manual = false;
  for (let i = 0; i < count; i++) {
    const byVersion: Record<string, string> = {};
    const referencesByVersion: Record<string, string> = {};
    const opens = i === 0 || segsByVersion[primary][i]?.ref !== undefined;
    if (opens) {
      importIndex += 1;
      manual = !!segsByVersion[primary][i]?.manual;
    }
    for (const v of versions) {
      const seg = segsByVersion[v][i];
      if (seg?.ref !== undefined) lastRef[v] = seg.ref;
      const ref = seg?.ref ?? lastRef[v] ?? "";
      if (ref.trim()) referencesByVersion[v] = ref.trim();
      const t = (seg?.text ?? "").trim();
      if (t) byVersion[v] = t;
    }
    if (Object.keys(byVersion).length === 0) continue;
    const reference = referencesByVersion[primary] ?? Object.values(referencesByVersion)[0];
    slides.push({
      id: uid(),
      kind: "scripture" as const,
      reference: reference || undefined,
      section: reference || undefined,
      importIndex: Math.max(0, importIndex),
      lines: byVersion[primary] ? [byVersion[primary]] : [],
      linesByVersion: byVersion,
      ...(Object.keys(referencesByVersion).length ? { referencesByVersion } : {}),
      ...(manual ? { manual } : {}),
    });
  }
  return slides;
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
