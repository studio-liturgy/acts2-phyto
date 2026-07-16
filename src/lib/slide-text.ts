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
