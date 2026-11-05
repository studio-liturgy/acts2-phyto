import type { VerseRow } from "@/lib/slide-text";
import type { Slide } from "@/lib/types";

/**
 * Picking whole rows in the scripture and message editors (the song grids'
 * line pick, for verses, points and images). Rows are numbered top to bottom:
 * a verse row in the scripture editor; a verse, a point or an image (each
 * tile of an image run) in the message editor, in slide order.
 */
export type RowRun = { from: number; to: number };

/** Inside a run? */
export const inRun = (run: RowRun | null, i: number): boolean =>
  !!run && i >= run.from && i <= run.to;

/* ── Clipboard ────────────────────────────────────────────────────────── */

/**
 * What was last copied or cut from a pick, kept in the page as well as put on
 * the clipboard as words: pasting those same words back into the same kind of
 * editor brings the rows back as they were (images, verse references, point
 * types), not as typed text.
 */
type RowClip =
  | { kind: "verses"; text: string; rows: VerseRow[] }
  | { kind: "slides"; text: string; slides: Slide[] };
let clip: RowClip | null = null;

const norm = (t: string) => t.replace(/\r\n?/g, "\n").trim();

export function setRowClip(next: RowClip): void {
  clip = { ...next, text: norm(next.text) };
}
/** The copied verse rows, when `text` is what was copied with them. */
export function versesFromClip(text: string): VerseRow[] | null {
  return clip?.kind === "verses" && clip.text === norm(text) ? clip.rows : null;
}
/** The copied slides, when `text` is what was copied with them. */
export function slidesFromClip(text: string): Slide[] | null {
  return clip?.kind === "slides" && clip.text === norm(text) ? clip.slides : null;
}
export function clearRowClip(): void {
  clip = null;
}

/* ── Scripture: verse rows ────────────────────────────────────────────── */

const sameImport = (a: VerseRow, b: VerseRow) =>
  !!a.manual === !!b.manual && JSON.stringify(a.refs) === JSON.stringify(b.refs);

/** Rows `from`..`to` gone. A passage that loses its first verse starts at the
 *  next one left, so it keeps its own reference. */
export function removeVerseRows(rows: VerseRow[], from: number, to: number): VerseRow[] {
  const out: VerseRow[] = [];
  let carryStart = false;
  rows.forEach((r, i) => {
    if (i >= from && i <= to) {
      if (r.starts) carryStart = true;
      return;
    }
    if (carryStart) {
      carryStart = false;
      out.push(r.starts ? r : { ...r, starts: true });
      return;
    }
    out.push(r);
  });
  return out;
}

/** `pasted` put in before row `at` (at = rows.length: the end). Verses of the
 *  same passage as the row above join it; others start a passage of their
 *  own, and the verses below them pick their own passage back up. */
export function insertVerseRows(rows: VerseRow[], at: number, pasted: VerseRow[]): VerseRow[] {
  if (!pasted.length) return rows;
  const copy = pasted.map((r) => ({ ...r, refs: { ...r.refs }, text: { ...r.text } }));
  const above = rows[at - 1];
  copy[0].starts = !above || !sameImport(above, copy[0]);
  for (let i = 1; i < copy.length; i++) {
    copy[i].starts = copy[i].starts || !sameImport(copy[i - 1], copy[i]);
  }
  const below = rows[at];
  const last = copy[copy.length - 1];
  const after =
    below && !below.starts && !sameImport(last, below) ? { ...below, starts: true } : below;
  return [...rows.slice(0, at), ...copy, ...(after ? [after] : []), ...rows.slice(at + 1)];
}

/** Copied rows as words: one verse per line, in one version. */
export function verseRowsText(rows: VerseRow[], version: string): string {
  return rows.map((r) => r.text[version] ?? "").join("\n");
}

/* ── Message: slides ──────────────────────────────────────────────────── */

/** A slide's words, one line each: a verse in `version`, a point's heading
 *  and lines (a quote with its attribution). Images have none (his call: the
 *  words copied leave pictures out; the page's own clip still holds them). */
export function slideText(s: Slide, version: string, primary: string): string[] {
  if (s.kind === "scripture")
    return [s.linesByVersion?.[version] ?? (version === primary ? (s.lines?.[0] ?? "") : "")];
  if (s.kind === "image") return [];
  const out: string[] = [];
  if (s.title) out.push(s.title);
  out.push(...(s.lines ?? []));
  if (s.attribution) out.push(s.attribution);
  return out;
}

export function slidesText(slides: Slide[], version: string, primary: string): string {
  return slides.flatMap((s) => slideText(s, version, primary)).join("\n");
}

/** Copies of `pasted` with fresh ids, put in before slide `at`. */
export function insertSlides(
  slides: Slide[],
  at: number,
  pasted: Slide[],
  newId: () => string,
): Slide[] {
  const copies = pasted.map((s) => ({ ...s, id: newId() }));
  return [...slides.slice(0, at), ...copies, ...slides.slice(at)];
}

/* ── Touch: which box in a row was tapped ─────────────────────────────── */

type Rect = { left: number; right: number; top: number; bottom: number };
/** The box under the finger, else the nearest one above or below it. */
export function pickCellAt(rects: Rect[], x: number, y: number): number {
  let best = -1;
  let bestD = Infinity;
  rects.forEach((r, i) => {
    const inX = x >= r.left && x <= r.right;
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    const dx = inX ? 0 : Math.min(Math.abs(x - r.left), Math.abs(x - r.right));
    const d = dy * 1000 + dx;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
