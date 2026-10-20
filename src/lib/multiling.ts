// Multilanguage songs (Song Settings): the aligned grid editor's model and the
// conversions every surface shares. Ported from watch's multilingual editor
// without its machine translation, proofreading or Free Mode.
//
// The alignment contract, which everything here exists to preserve:
//
//     slide index N is line index N in EVERY language
//
// So one slide holds one line per language. Section labels ("[Chorus]") are
// their own full-width rows, so they never consume a line number and never
// shift one language against another.
//
// What a slide SHOWS is baked into its plain `lines`: the presenter's chosen
// languages (at most four), stacked in column order, with `lineLangs` naming
// each line's language. Every surface that reads `lines` (slides, thumbnails,
// the output window, phones, older builds) shows the stack with no changes;
// `linesByLang` keeps every language so hiding one never loses its words.
import type { Slide, Set as PhytoSet } from "./types";
import { LANGS, type LangCode } from "./langs";

/** At most this many languages are stacked on a slide at once. */
export const MAX_SHOWN_LANGS = 4;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/** A full-width label row. Produces no slide; sets `section` on the rows below. */
export interface SectionRow {
  kind: "section";
  text: string;
}

/** One numbered row: one slide, one line per language. */
export interface LineRow {
  kind: "line";
  byLang: Partial<Record<LangCode, string>>;
}

export type MultiRow = SectionRow | LineRow;

/**
 * The languages a slide shows: `shown` (the presenter's choice) in column
 * order, else the first four columns. Never more than four, never one that
 * isn't a column.
 */
export function shownLangs(langs: LangCode[], shown?: LangCode[]): LangCode[] {
  const picked = shown?.length ? langs.filter((l) => shown.includes(l)) : langs;
  return (picked.length ? picked : langs).slice(0, MAX_SHOWN_LANGS);
}

/** The stacked lines for one slide's languages, and which language each is. */
function stack(
  byLang: Partial<Record<LangCode, string>>,
  show: LangCode[],
): { lines: string[]; lineLangs: LangCode[] } {
  const lines: string[] = [];
  const lineLangs: LangCode[] = [];
  for (const l of show) {
    const text = byLang[l]?.trim();
    if (!text) continue;
    lines.push(text);
    lineLangs.push(l);
  }
  return { lines, lineLangs };
}

/**
 * Editor rows to slides. One slide per line row, carrying every language the
 * row has text for (not only the shown ones, so hiding a language never
 * destroys its words) and the shown ones stacked in `lines`.
 */
export function rowsToSlides(rows: MultiRow[], show: LangCode[]): Slide[] {
  const slides: Slide[] = [];
  let section: string | undefined;
  for (const row of rows) {
    if (row.kind === "section") {
      section = row.text.trim() || undefined;
      continue;
    }
    const byLang: Partial<Record<LangCode, string>> = {};
    for (const [code, text] of Object.entries(row.byLang)) {
      const trimmed = text?.trim();
      if (trimmed) byLang[code as LangCode] = trimmed;
    }
    // A row blank in every language (the empty line being typed into) makes
    // no slide, so the projector never gets a blank one.
    if (Object.keys(byLang).length === 0) continue;
    const { lines, lineLangs } = stack(byLang, show);
    slides.push({
      id: uid(),
      kind: "lyric",
      lines,
      linesByLang: byLang,
      ...(lineLangs.length ? { lineLangs } : {}),
      ...(section ? { section } : {}),
    });
  }
  return slides;
}

/**
 * Slides back to editor rows. Inverse of rowsToSlides on its own output: a
 * section row is emitted wherever the section changes.
 */
export function slidesToRows(slides: Slide[]): MultiRow[] {
  const rows: MultiRow[] = [];
  let prevSection: string | undefined;
  for (const s of slides) {
    if (s.section !== prevSection) {
      if (s.section) rows.push({ kind: "section", text: s.section });
      prevSection = s.section;
    }
    rows.push({ kind: "line", byLang: { ...(s.linesByLang ?? {}) } });
  }
  return rows;
}

/** Restack every slide for a new choice of shown languages (the presenter's
 *  language chips). Words in `linesByLang` are untouched. */
export function restackSlides(slides: Slide[], show: LangCode[]): Slide[] {
  return slides.map((s) => {
    if (!s.linesByLang) return s;
    const { lines, lineLangs } = stack(s.linesByLang, show);
    const { lineLangs: _old, ...rest } = s;
    return { ...rest, lines, ...(lineLangs.length ? { lineLangs } : {}) };
  });
}

/**
 * Fast Edit on a Multilanguage slide: the edited `lines` written back into
 * each shown language's own line (by position), so the grid keeps the edit.
 * An emptied line clears that language here; extra lines past the shown
 * languages stay on the slide only until the next restack. Any other slide
 * just takes the lines.
 */
export function editedLangLines(slide: Slide, lines: string[]): Partial<Slide> {
  if (!slide.linesByLang || !slide.lineLangs?.length) return { lines };
  const linesByLang = { ...slide.linesByLang };
  slide.lineLangs.forEach((lang, i) => {
    const text = lines[i]?.trim();
    if (text) linesByLang[lang] = text;
    else delete linesByLang[lang];
  });
  return { lines, linesByLang };
}

/**
 * Switching a Standard song to Multilanguage: its existing words become the
 * first column, `lang`. Each lyric line becomes its own row (line N is slide
 * N), sections carry over, and slide breaks (`---`) dissolve since every line
 * is now a slide.
 */
export function standardToRows(slides: Slide[], lang: LangCode): MultiRow[] {
  const rows: MultiRow[] = [];
  let prevSection: string | undefined;
  for (const s of slides) {
    if (s.section !== prevSection) {
      if (s.section) rows.push({ kind: "section", text: s.section });
      prevSection = s.section;
    }
    for (const line of s.lines ?? []) {
      if (line.trim()) rows.push({ kind: "line", byLang: { [lang]: line.trim() } });
    }
  }
  return rows;
}

/**
 * Switching a Multilanguage song back to Standard: each slide keeps every
 * language it has words in, stacked in column order (then any language that
 * is no longer a column), so nothing is lost. The plain editor then shows the
 * slides as they were, one line per language.
 */
export function multilangToStandard(slides: Slide[], langs: LangCode[]): Slide[] {
  return slides.flatMap((s) => {
    if (!s.linesByLang) return [s];
    const order = [
      ...langs,
      ...(Object.keys(s.linesByLang) as LangCode[]).filter((l) => !langs.includes(l)),
    ];
    const { lines } = stack(s.linesByLang, order);
    if (lines.length === 0) return [];
    const { linesByLang: _b, lineLangs: _l, ...rest } = s;
    return [{ ...rest, lines }];
  });
}

/**
 * Split a pasted block into the lines it should fill downward from the focused
 * cell. Blank lines are dropped rather than becoming empty rows, because a
 * pasted lyric sheet uses them as stanza breaks and an empty row would push
 * every language below it out of alignment.
 */
export function splitPasteBlock(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Paste a block down one column from `row`: one line per line row (section
 * rows are skipped), adding rows at the bottom as needed. Other columns stay
 * where they are.
 */
export function pasteDownColumn(
  rows: MultiRow[],
  row: number,
  lang: LangCode,
  lines: string[],
): MultiRow[] {
  const next = [...rows];
  let cursor = row;
  for (const line of lines) {
    while (cursor < next.length && next[cursor].kind !== "line") cursor++;
    if (cursor >= next.length) next.push({ kind: "line", byLang: {} });
    const target = next[cursor] as LineRow;
    next[cursor] = { ...target, byLang: { ...target.byLang, [lang]: line } };
    cursor++;
  }
  return next;
}

// ---------------------------------------------------------------------------
// One-column edits in the grid. Each language is a column of line cells; these
// move or clear one column without touching the others. Section rows are
// skipped: they sit between lines and belong to no column.
// ---------------------------------------------------------------------------

const lineIndexes = (rows: MultiRow[]) => rows.flatMap((r, i) => (r.kind === "line" ? [i] : []));

const isEmptyLine = (r: MultiRow) =>
  r.kind === "line" && Object.values(r.byLang).every((v) => !v?.trim());

/** Write a column's values back onto the line rows, in order. */
function writeColumn(rows: MultiRow[], idx: number[], lang: LangCode, values: string[]) {
  const next = [...rows];
  idx.forEach((rowAt, k) => {
    const r = next[rowAt] as LineRow;
    const byLang = { ...r.byLang };
    if (values[k]) byLang[lang] = values[k];
    else delete byLang[lang];
    next[rowAt] = { ...r, byLang };
  });
  return next;
}

/**
 * Cmd+Enter: an empty cell below `row` in `lang` only. Every later line of that
 * language moves down one; the other languages stay where they are. A row is
 * added at the bottom only when that pushes text off the end.
 */
export function insertColumnCell(rows: MultiRow[], row: number, lang: LangCode): MultiRow[] {
  const idx = lineIndexes(rows);
  const pos = idx.indexOf(row);
  if (pos < 0) return rows;
  const values = idx.map((i) => (rows[i] as LineRow).byLang[lang] ?? "");
  const shifted = [...values.slice(0, pos + 1), "", ...values.slice(pos + 1)];
  let next = rows;
  // On the last line the new cell itself needs a row; elsewhere a row is only
  // added when text is pushed off the end.
  if (shifted[shifted.length - 1] || pos === values.length - 1) {
    next = [...rows, { kind: "line", byLang: {} }];
    idx.push(next.length - 1);
  } else {
    shifted.pop();
  }
  return writeColumn(next, idx, lang, shifted);
}

/**
 * Cmd+Backspace: remove `row`'s cell in `lang` only, pulling every later line
 * of that language up one. If that leaves the last line completely empty (its
 * only text was this language's), the row goes too.
 */
export function removeColumnCell(rows: MultiRow[], row: number, lang: LangCode): MultiRow[] {
  const idx = lineIndexes(rows);
  const pos = idx.indexOf(row);
  if (pos < 0) return rows;
  const values = idx.map((i) => (rows[i] as LineRow).byLang[lang] ?? "");
  const pulled = [...values.slice(0, pos), ...values.slice(pos + 1), ""];
  const lastAt = idx[idx.length - 1];
  const lastWasEmpty = isEmptyLine(rows[lastAt]);
  const next = writeColumn(rows, idx, lang, pulled);
  if (!lastWasEmpty && isEmptyLine(next[lastAt]) && idx.length > 1) {
    return next.filter((_, i) => i !== lastAt);
  }
  return next;
}

/**
 * Delete a run of one column (a drag selection), rows `from`..`to` inclusive.
 * A row that still has words in another language keeps its place with this
 * cell emptied; a row this leaves with no words at all is removed. At least one
 * line always remains.
 */
export function clearColumnRange(
  rows: MultiRow[],
  lang: LangCode,
  from: number,
  to: number,
): MultiRow[] {
  const next: MultiRow[] = [];
  rows.forEach((r, i) => {
    if (r.kind !== "line" || i < from || i > to) {
      next.push(r);
      return;
    }
    const byLang = { ...r.byLang };
    delete byLang[lang];
    const cleared: MultiRow = { ...r, byLang };
    if (!isEmptyLine(cleared)) next.push(cleared);
  });
  return next.some((r) => r.kind === "line") ? next : [...next, { kind: "line", byLang: {} }];
}

/** The text of a column run, one line per row, for copy and cut. */
export function columnRangeText(rows: MultiRow[], lang: LangCode, from: number, to: number) {
  return rows
    .flatMap((r, i) => (r.kind === "line" && i >= from && i <= to ? [r.byLang[lang] ?? ""] : []))
    .join("\n");
}

/** The languages a set actually has words in, in canonical order. */
export function langsWithText(slides: Slide[]): LangCode[] {
  const seen = new Set<string>();
  for (const s of slides)
    for (const [l, t] of Object.entries(s.linesByLang ?? {})) if (t?.trim()) seen.add(l);
  return LANGS.map((l) => l.code).filter((c) => seen.has(c));
}

/** A Multilanguage song's columns (empty for any other set). */
export function songLangs(set: Pick<PhytoSet, "kind" | "songLayout" | "langs">): LangCode[] {
  if (set.kind !== "song" || set.songLayout !== "multilang") return [];
  return set.langs ?? [];
}
