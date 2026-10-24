// Multilanguage songs (Song Settings): the aligned grid editor's model and the
// conversions every surface shares. Ported from watch's multilingual editor
// without its machine translation, proofreading or Free Mode.
//
// The alignment contract, which everything here exists to preserve:
//
//     grid line N is line N in EVERY language
//
// Section labels ("[Chorus]") are their own full-width rows, so they never
// consume a line number and never shift one language against another. Slide
// breaks are rows too (`break`): a slide is the lines between two breaks (or a
// break and a section), and shows each language's run in turn:
//
//     Line 1 (Language A)
//     Line 2 (Language A)
//     Line 1 (Language B)
//     Line 2 (Language B)
//
// What a slide SHOWS is baked into its plain `lines`: the presenter's chosen
// languages (at most four), in column order, with `lineLangs` naming each
// line's language. Every surface that reads `lines` (slides, thumbnails, the
// output window, phones, older builds) shows the stack with no changes.
// `linesByLang` keeps every language, its lines joined by "\n" with an empty
// entry where that language has no words on that line, so the grid round-trips
// exactly and hiding a language never loses its words.
import type { HiddenLangs, Slide, Set as PhytoSet } from "./types";
import { LANGS, type LangCode } from "./langs";
import { splitChordLine, stripChordsRaw } from "./chords";

/** At most this many languages are stacked on a slide at once. */
export const MAX_SHOWN_LANGS = 4;
/** Lines of each language per slide: 1 or 2. */
export const MAX_LANG_LINES_PER = 2;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/** A full-width label row. Produces no slide; sets `section` on the rows below. */
export interface SectionRow {
  kind: "section";
  text: string;
}

/** One numbered row: one line in every language. */
export interface LineRow {
  kind: "line";
  byLang: Partial<Record<LangCode, string>>;
}

/** A slide break between two lines. Produces no slide and no line number. */
export interface BreakRow {
  kind: "break";
}

export type MultiRow = SectionRow | BreakRow | LineRow;

const hasWords = (r: LineRow) => Object.values(r.byLang).some((v) => v?.trim());

/**
 * Lines per slide: the breaks taken out and put back every `perSlide` lines
 * within each section. An empty row counts as a line (it's one being typed),
 * so a new line lands on its slide straight away and typing into it never
 * moves anything.
 */
export function divideRows(rows: MultiRow[], perSlide: number): MultiRow[] {
  const per = Math.max(1, perSlide);
  const out: MultiRow[] = [];
  let count = 0;
  for (const r of rows) {
    if (r.kind === "break") continue;
    if (r.kind === "section") {
      count = 0;
      out.push(r);
      continue;
    }
    if (count > 0 && count % per === 0) out.push({ kind: "break" });
    count += 1;
    out.push(r);
  }
  return out;
}

/** Whether two grids divide into the same slides (same rows in each). */
export function sameDivision(a: MultiRow[], b: MultiRow[]): boolean {
  const shape = (rows: MultiRow[]) =>
    JSON.stringify(rowsToSlides(rows, []).map((sl) => [sl.section ?? "", sl.linesByLang]));
  return shape(a) === shape(b);
}

/** A break row between consecutive slides of one section. */
function pushBreak(rows: MultiRow[]) {
  const last = rows[rows.length - 1];
  if (last && last.kind === "line") rows.push({ kind: "break" });
}

/** Lines of each language per slide, from the set (1 or 2). */
export function langLinesPer(set: Pick<PhytoSet, "langLinesPer">): number {
  return Math.min(MAX_LANG_LINES_PER, Math.max(1, Math.round(set.langLinesPer ?? 1)));
}

/**
 * The languages a slide shows, in the order they stack: `shown` (the language
 * bar's choice, in its own order), else the first four columns. Never more
 * than four, never one that isn't a column.
 */
export function shownLangs(langs: LangCode[], shown?: LangCode[]): LangCode[] {
  const picked = shown?.length ? shown.filter((l) => langs.includes(l)) : langs;
  return (picked.length ? picked : langs).slice(0, MAX_SHOWN_LANGS);
}

/** A slide's lines in one language (empty entries where it has none). */
function langRun(byLang: Partial<Record<string, string>>, lang: string): string[] {
  return (byLang[lang] ?? "").split("\n");
}

/** The stacked lines for one slide's languages, and which language each is. */
function stack(
  byLang: Partial<Record<string, string>>,
  show: readonly string[],
): { lines: string[]; lineLangs: LangCode[] } {
  const lines: string[] = [];
  const lineLangs: LangCode[] = [];
  for (const l of show) {
    for (const text of langRun(byLang, l)) {
      if (!text.trim()) continue;
      lines.push(text.trim());
      lineLangs.push(l as LangCode);
    }
  }
  return { lines, lineLangs };
}

/** Which grid rows start a slide, and its number (null for the rows after the
 *  first in a slide, and for section rows). Blank rows make no slide. */
export function slideStarts(rows: MultiRow[]): (number | null)[] {
  const out: (number | null)[] = [];
  let n = 0;
  let open = false;
  for (const r of rows) {
    if (r.kind !== "line") {
      open = false;
      out.push(null);
      continue;
    }
    if (!hasWords(r)) {
      out.push(null);
      continue;
    }
    if (!open) {
      n += 1;
      open = true;
      out.push(n);
    } else out.push(null);
  }
  return out;
}

/**
 * Editor rows to slides: `perSlide` lines of a section per slide, carrying
 * every language the rows have words in (not only the shown ones, so hiding a
 * language never destroys its words) and the shown ones stacked in `lines`.
 * A row blank in every language (the empty line being typed into) is skipped,
 * so the projector never gets a blank slide.
 */
export function rowsToSlides(rows: MultiRow[], show: LangCode[]): Slide[] {
  const slides: Slide[] = [];
  let section: string | undefined;
  let chunk: LineRow[] = [];
  const flush = () => {
    if (!chunk.length) return;
    const present = new Set<string>();
    for (const r of chunk)
      for (const [l, t] of Object.entries(r.byLang)) if (t?.trim()) present.add(l);
    const byLang: Partial<Record<LangCode, string>> = {};
    for (const l of present) {
      byLang[l as LangCode] = chunk.map((r) => r.byLang[l as LangCode]?.trim() ?? "").join("\n");
    }
    const { lines, lineLangs } = stack(byLang, show);
    slides.push({
      id: uid(),
      kind: "lyric",
      lines,
      linesByLang: byLang,
      ...(lineLangs.length ? { lineLangs } : {}),
      ...(section ? { section } : {}),
    });
    chunk = [];
  };
  for (const row of rows) {
    if (row.kind === "section") {
      flush();
      section = row.text.trim() || undefined;
      continue;
    }
    if (row.kind === "break") {
      flush();
      continue;
    }
    if (!hasWords(row)) continue;
    chunk.push(row);
  }
  flush();
  return slides;
}

/**
 * Slides back to editor rows. Inverse of rowsToSlides on its own output: a
 * section row wherever the section changes, then each slide's lines.
 */
export function slidesToRows(slides: Slide[]): MultiRow[] {
  const rows: MultiRow[] = [];
  let prevSection: string | undefined;
  for (const s of slides) {
    if (s.section !== prevSection) {
      if (s.section) rows.push({ kind: "section", text: s.section });
      prevSection = s.section;
    } else pushBreak(rows);
    const byLang = s.linesByLang ?? {};
    const count = Math.max(1, ...Object.values(byLang).map((t) => (t ?? "").split("\n").length));
    for (let i = 0; i < count; i++) {
      const row: LineRow = { kind: "line", byLang: {} };
      for (const l of Object.keys(byLang)) {
        const text = langRun(byLang, l)[i]?.trim();
        if (text) row.byLang[l as LangCode] = text;
      }
      rows.push(row);
    }
  }
  return rows;
}

/** Restack every slide for a new choice of shown languages (the language
 *  chips). Words in `linesByLang` are untouched. */
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
 * each shown language's own lines (by position), so the grid keeps the edit.
 * Any other slide just takes the lines.
 */
export function editedLangLines(slide: Slide, lines: string[]): Partial<Slide> {
  if (!slide.linesByLang || !slide.lineLangs?.length) return { lines };
  const linesByLang = { ...slide.linesByLang };
  const edited = new Map<LangCode, string[]>();
  slide.lineLangs.forEach((lang, i) => {
    const run = edited.get(lang) ?? [];
    run.push(lines[i]?.trim() ?? "");
    edited.set(lang, run);
  });
  for (const [lang, run] of edited) {
    // The language's slots on this slide, filled in order where it had words.
    const slots = langRun(linesByLang, lang);
    let k = 0;
    const next = slots.map((t) => (t.trim() ? (run[k++] ?? "") : ""));
    if (next.some((t) => t)) linesByLang[lang] = next.join("\n");
    else delete linesByLang[lang];
  }
  return { lines, linesByLang };
}

/**
 * Switching a Standard song to Multilanguage: its existing words become the
 * first column, `lang`. Each lyric line becomes its own row, and sections and
 * slide breaks carry over.
 */
export function standardToRows(slides: Slide[], lang: LangCode): MultiRow[] {
  const rows: MultiRow[] = [];
  let prevSection: string | undefined;
  for (const s of slides) {
    if (s.section !== prevSection) {
      if (s.section) rows.push({ kind: "section", text: s.section });
      prevSection = s.section;
    } else pushBreak(rows);
    for (const line of s.lines ?? []) {
      if (line.trim()) rows.push({ kind: "line", byLang: { [lang]: line.trim() } });
    }
  }
  return rows;
}

/**
 * Leaving Multilanguage: the plain-editor text for the language kept (sections
 * as `[Label]`, one lyric line per line, the grid's slide breaks as `---`),
 * and the whole grid to keep hidden.
 */
export function leaveMultilang(
  set: Pick<PhytoSet, "slides" | "langs" | "langsShown" | "langLinesPer">,
  kept: LangCode,
): { text: string; hidden: HiddenLangs } {
  const rows = slidesToRows(set.slides);
  const out: string[] = [];
  for (const r of rows) {
    if (r.kind === "section") {
      if (out.length) out.push("");
      out.push(`[${r.text}]`);
    } else if (r.kind === "break") {
      const last = out[out.length - 1];
      if (last !== undefined && last !== "---" && last !== "" && !/^\[.*\]$/.test(last))
        out.push("---");
    } else if (r.byLang[kept]?.trim()) out.push(r.byLang[kept]!.trim());
  }
  while (out[out.length - 1] === "---") out.pop();
  return {
    text: out.join("\n"),
    hidden: {
      kept,
      langs: set.langs ?? [kept],
      ...(set.langsShown ? { langsShown: set.langsShown } : {}),
      ...(set.langLinesPer ? { langLinesPer: set.langLinesPer } : {}),
      rows,
    },
  };
}

/**
 * Back into Multi-Language: the plain editor's words (and its sections, as
 * they are now: a section deleted or added meanwhile stays that way) fill the
 * kept language's column line by line, and the hidden languages fill theirs
 * from the kept grid in the same line order. Hidden lines past the plain
 * words are kept at the end, so nothing hidden is lost.
 */
export function returnToMultilang(hidden: HiddenLangs, plain: Slide[]): MultiRow[] {
  const others = hidden.rows.flatMap((r) =>
    r.kind === "line"
      ? [Object.fromEntries(Object.entries(r.byLang).filter(([l]) => l !== hidden.kept))]
      : [],
  ) as Partial<Record<LangCode, string>>[];
  const rows: MultiRow[] = [];
  let prevSection: string | undefined;
  let k = 0;
  for (const s of plain) {
    if (s.section !== prevSection) {
      if (s.section) rows.push({ kind: "section", text: s.section });
      prevSection = s.section;
    } else pushBreak(rows);
    for (const line of s.lines ?? []) {
      if (!line.trim()) continue;
      rows.push({ kind: "line", byLang: { ...(others[k++] ?? {}), [hidden.kept]: line.trim() } });
    }
  }
  for (; k < others.length; k++) rows.push({ kind: "line", byLang: { ...others[k] } });
  return rows.filter((r) => r.kind !== "line" || hasWords(r));
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

/** Every slide's line in `lang` transposed (the Key picker in Multilanguage:
 *  chords live in the cells). */
export function transposeLangColumn(
  slides: Slide[],
  lang: LangCode,
  transpose: (line: string) => string,
  show: LangCode[],
): Slide[] {
  return restackSlides(
    slides.map((s) => {
      const t = s.linesByLang?.[lang];
      if (!t) return s;
      return {
        ...s,
        linesByLang: { ...s.linesByLang, [lang]: t.split("\n").map(transpose).join("\n") },
      };
    }),
    show,
  );
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
 * Enter: split `row`'s cell in `lang` at `caret` (a position in the words, chords
 * left out). The words after the cursor, chords with them, become the next line
 * of that language and every later line of it moves down one, across sections
 * and slide breaks; the other languages stay where they are. Nothing is
 * trimmed, so Backspace joins the two halves back exactly.
 */
export function splitColumnCell(
  rows: MultiRow[],
  row: number,
  lang: LangCode,
  caret: number,
): MultiRow[] {
  const cur = rows[row];
  if (cur?.kind !== "line") return rows;
  const [left, right] = splitChordLine(cur.byLang[lang] ?? "", caret);
  const idx = lineIndexes(rows);
  const pos = idx.indexOf(row);
  const values = idx.map((i) => (rows[i] as LineRow).byLang[lang] ?? "");
  const shifted = [...values.slice(0, pos), left, right, ...values.slice(pos + 1)];
  let next = rows;
  if (shifted[shifted.length - 1] || pos === values.length - 1) {
    next = [...rows, { kind: "line", byLang: {} }];
    idx.push(next.length - 1);
  } else {
    shifted.pop();
  }
  return writeColumn(next, idx, lang, shifted);
}

/**
 * Backspace at the start of a line: `row`'s cell in `lang` joins the end of the
 * line above in that language (as typed, no space added, chords kept) and every
 * later line of it moves up one, across sections and slide breaks. `caret` is
 * where the join happened in the line above (words only). Null on the first
 * line, where there is nothing to join onto.
 */
export function joinColumnCell(
  rows: MultiRow[],
  row: number,
  lang: LangCode,
): { rows: MultiRow[]; row: number; caret: number } | null {
  const idx = lineIndexes(rows);
  const pos = idx.indexOf(row);
  if (pos <= 0) return null;
  const aboveAt = idx[pos - 1];
  const above = (rows[aboveAt] as LineRow).byLang[lang] ?? "";
  const here = (rows[row] as LineRow).byLang[lang] ?? "";
  const joined = writeColumn(rows, [aboveAt], lang, [above + here]);
  return {
    rows: removeColumnCell(joined, row, lang),
    row: aboveAt,
    caret: stripChordsRaw(above).length,
  };
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

/** The text of a column run, one line per row, for copy and cut. With
 *  `keepChords` off (Chords switched off) the (G) chords are left out. */
export function columnRangeText(
  rows: MultiRow[],
  lang: LangCode,
  from: number,
  to: number,
  keepChords = true,
) {
  return rows
    .flatMap((r, i) => (r.kind === "line" && i >= from && i <= to ? [r.byLang[lang] ?? ""] : []))
    .map((t) => (keepChords ? t : stripChordsRaw(t)))
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

/** + Section: a section row above row `at` (the row the cursor is on); with no
 *  cursor row, at the end with an empty line under it. `line` is the line
 *  number (nth line row) the caret goes to. */
export function addSectionRow(
  rows: MultiRow[],
  at: number | null,
  name: string,
): { rows: MultiRow[]; line: number } {
  const section: SectionRow = { kind: "section", text: name };
  const linesBefore = (n: number) => rows.slice(0, n).filter((r) => r.kind === "line").length;
  if (at === null || at > rows.length) {
    return {
      rows: [...rows, section, { kind: "line", byLang: {} }],
      line: linesBefore(rows.length),
    };
  }
  return { rows: [...rows.slice(0, at), section, ...rows.slice(at)], line: linesBefore(at) };
}
