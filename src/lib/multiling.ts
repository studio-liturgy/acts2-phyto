// Multilanguage songs (Song Settings): the aligned grid editor's model and the
// conversions every surface shares. Ported from watch's multilingual editor
// without its machine translation, proofreading or Free Mode.
//
// The alignment contract, which everything here exists to preserve:
//
//     grid line N is line N in EVERY language
//
// Section labels ("[Chorus]") are their own full-width rows, so they never
// consume a line number and never shift one language against another. A slide
// takes `perSlide` consecutive lines (1 or 2) of a section and shows each
// language's run in turn:
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

export type MultiRow = SectionRow | LineRow;

const hasWords = (r: LineRow) => Object.values(r.byLang).some((v) => v?.trim());

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
export function slideStarts(rows: MultiRow[], perSlide: number): (number | null)[] {
  const out: (number | null)[] = [];
  let n = 0;
  let inSlide = 0;
  for (const r of rows) {
    if (r.kind === "section") {
      inSlide = 0;
      out.push(null);
      continue;
    }
    if (!hasWords(r)) {
      out.push(null);
      continue;
    }
    if (inSlide === 0) {
      n += 1;
      out.push(n);
    } else out.push(null);
    inSlide = (inSlide + 1) % perSlide;
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
export function rowsToSlides(rows: MultiRow[], show: LangCode[], perSlide = 1): Slide[] {
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
    if (!hasWords(row)) continue;
    chunk.push(row);
    if (chunk.length >= perSlide) flush();
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
    }
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
 * first column, `lang`. Each lyric line becomes its own row, sections carry
 * over, and slide breaks (`---`) dissolve: the grid's lines per slide decides.
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
 * Leaving Multilanguage: the plain-editor text for the language kept (sections
 * as `[Label]`, one lyric line per line, no slide breaks: the plain editor's
 * Lines per slide divides it), and the whole grid to keep hidden.
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
    } else if (r.byLang[kept]?.trim()) out.push(r.byLang[kept]!.trim());
  }
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
 * Back into Multilanguage: the hidden grid, with the kept language's column
 * refilled from the plain editor's current words (so edits made meanwhile
 * survive), line by line in order. Extra plain lines add rows at the end; if
 * there are fewer, the kept column empties below them.
 */
export function returnToMultilang(hidden: HiddenLangs, plain: Slide[]): MultiRow[] {
  const words = plain.flatMap((s) => (s.lines ?? []).map((l) => l.trim()).filter(Boolean));
  const rows: MultiRow[] = hidden.rows.map((r) =>
    r.kind === "section" ? { ...r } : { kind: "line", byLang: { ...r.byLang } },
  );
  let k = 0;
  for (const r of rows) {
    if (r.kind !== "line") continue;
    const text = words[k++];
    if (text) r.byLang[hidden.kept] = text;
    else delete r.byLang[hidden.kept];
  }
  for (; k < words.length; k++) rows.push({ kind: "line", byLang: { [hidden.kept]: words[k] } });
  return rows.filter((r) => r.kind === "section" || hasWords(r));
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
