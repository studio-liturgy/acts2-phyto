// The Call and Response grid's model: a view over the plain lyrics text (the
// same text the plain editor holds and the slides are parsed from), one grid
// row per stored line. `[Label]` lines are section rows, `---` lines are slide
// breaks, blank lines are skipped, and every other line is a lyric row with
// its reader (the roles array runs alongside the text, one entry per line).
// A line holding a single space is a lyric row still being typed into (a new
// empty line): it shows as a row but makes nothing on a slide.
//
// Every edit returns the new text AND the new roles together, so the two can
// never drift apart.
import { splitChordLine, stripChordsRaw } from "./chords";
import type { LineRoles, Role } from "./song-roles";

export type ResponseRow =
  | {
      kind: "section";
      index: number;
      text: string;
      /** Which of the slide panel's section groups this is (its colour). */
      group: number;
    }
  | { kind: "break"; index: number }
  | {
      kind: "line";
      index: number;
      text: string;
      /** Line number within its slide (restarts after a break or section). */
      n: number;
      /** First line of its slide: no split handle above it. */
      first: boolean;
    };

const SECTION_RE = /^\s*\[(.+)\]\s*$/;
const BREAK_RE = /^\s*---\s*$/;

/** A lyric row: words, or the one-space placeholder of a new empty line. */
export function isLyricLine(line: string): boolean {
  return (!!line.trim() || line === " ") && !SECTION_RE.test(line) && !BREAK_RE.test(line);
}

export function responseRows(lyrics: string): ResponseRow[] {
  const out: ResponseRow[] = [];
  let n = 0;
  // The slide panel groups slides by section, colouring each group in turn;
  // lines before the first label are a group of their own.
  let group = -1;
  let sawLine = false;
  lyrics.split("\n").forEach((line, index) => {
    const sec = SECTION_RE.exec(line);
    if (sec) {
      group += 1;
      out.push({ kind: "section", index, text: sec[1], group });
      n = 0;
    } else if (BREAK_RE.test(line)) {
      out.push({ kind: "break", index });
      n = 0;
    } else if (isLyricLine(line)) {
      if (!sawLine && group < 0) group = 0;
      sawLine = true;
      n += 1;
      out.push({ kind: "line", index, text: line, n, first: n === 1 });
    }
  });
  return out;
}

export interface Doc {
  lines: string[];
  roles: LineRoles;
}

export function toDoc(lyrics: string, roles: LineRoles): Doc {
  const lines = lyrics.split("\n");
  return { lines, roles: lines.map((_, i) => roles[i] ?? null) };
}

export function fromDoc(doc: Doc): { lyrics: string; roles: LineRoles } {
  return { lyrics: doc.lines.join("\n"), roles: doc.roles };
}

/** Insert lines at `at` (before the current line `at`), each with its role. */
export function insertLines(doc: Doc, at: number, lines: string[], roles: (Role | null)[]): Doc {
  return {
    lines: [...doc.lines.slice(0, at), ...lines, ...doc.lines.slice(at)],
    roles: [...doc.roles.slice(0, at), ...roles, ...doc.roles.slice(at)],
  };
}

export function removeLine(doc: Doc, at: number): Doc {
  return {
    lines: doc.lines.filter((_, i) => i !== at),
    roles: doc.roles.filter((_, i) => i !== at),
  };
}

export function setLine(doc: Doc, at: number, text: string, role?: Role | null): Doc {
  const lines = [...doc.lines];
  const roles = [...doc.roles];
  lines[at] = text;
  if (role !== undefined) roles[at] = role;
  return { lines, roles };
}

/** A slide break below line `at`, unless one is already there; returns the
 *  doc and the index of the lyric line after the break (adding an empty line
 *  for `role` when there isn't one), where the cursor goes. */
export function breakAfter(doc: Doc, at: number, role: Role | null): { doc: Doc; focus: number } {
  let next = at + 1;
  let d = doc;
  if (!BREAK_RE.test(d.lines[next] ?? "")) d = insertLines(d, next, ["---"], [null]);
  next += 1;
  if (!isLyricLine(d.lines[next] ?? "")) d = insertLines(d, next, [" "], [role]);
  return { doc: d, focus: next };
}

/** Move line `from` (a section or break row) to sit before line `to`. */
export function moveLine(doc: Doc, from: number, to: number): Doc {
  if (from === to || from + 1 === to) return doc;
  const line = doc.lines[from];
  const role = doc.roles[from];
  const removed = removeLine(doc, from);
  return insertLines(removed, to > from ? to - 1 : to, [line], [role]);
}

/** A slide break above line `at`, unless one is already there. */
export function breakBefore(doc: Doc, at: number): Doc {
  let p = at - 1;
  while (p >= 0 && !doc.lines[p].trim()) p--;
  if (p >= 0 && BREAK_RE.test(doc.lines[p])) return doc;
  return insertLines(doc, at, ["---"], [null]);
}

/** The stored index of the lyric row before / after `at` (skipping breaks,
 *  sections and blanks), or -1. */
export function neighbourLine(lyrics: string, at: number, dir: -1 | 1): number {
  const lines = lyrics.split("\n");
  for (let i = at + dir; i >= 0 && i < lines.length; i += dir) {
    if (isLyricLine(lines[i])) return i;
  }
  return -1;
}

/**
 * Backspace at the start of a line: with a slide break above, the break goes;
 * otherwise the line joins the end of the lyric line before it. Nothing
 * happens at the top, or across a section. `breakRemoved` tells the caller. Returns where the caret goes: the join, in
 * the words as shown (chords hidden).
 */
export function mergeIntoPrevious(
  doc: Doc,
  at: number,
  shown: (line: string) => string,
): { doc: Doc; focus: number; caret: number; breakRemoved?: boolean } | null {
  let prev = at - 1;
  for (; prev >= 0; prev--) {
    const l = doc.lines[prev];
    if (SECTION_RE.test(l)) return null;
    // A slide break above: Backspace removes it (the line stays put).
    if (BREAK_RE.test(l))
      return { doc: removeLine(doc, prev), focus: at - 1, caret: 0, breakRemoved: true };
    if (isLyricLine(l)) break;
  }
  if (prev < 0) return null;
  const head = doc.lines[prev].trim() ? doc.lines[prev] : "";
  const tail = doc.lines[at].trim() ? doc.lines[at] : "";
  const joined = head + tail;
  const merged = setLine(doc, prev, joined.trim() ? joined : " ");
  return { doc: removeLine(merged, at), focus: prev, caret: shown(head).length };
}

/**
 * Cmd+Enter at `caret` (in the words as shown, chords hidden). In the middle
 * of a line: the words after the caret go to a new line on a new slide (each
 * chord stays with its word), the caret at its start. At the end (or start)
 * of a line: a break after it, the caret onto the next line (`breakAfter`).
 */
export function breakAtCaret(
  doc: Doc,
  at: number,
  caret: number,
  role: Role | null,
): { doc: Doc; focus: number } {
  const line = doc.lines[at] ?? "";
  const shown = stripChordsRaw(line.trim() ? line : "");
  if (caret <= 0 || caret >= shown.length) return breakAfter(doc, at, role);
  const [left, right] = splitChordLine(line, caret);
  const kept = setLine(doc, at, left.trimEnd() || " ");
  return {
    doc: insertLines(kept, at + 1, ["---", right.trimStart() || " "], [null, role]),
    focus: at + 2,
  };
}

/** + Section: a section row above line `at` (the line the cursor is on), the
 *  caret back on that line; with no cursor line, at the end with an empty line
 *  under it for `role`, the caret there. */
export function addSection(
  doc: Doc,
  at: number | null,
  name: string,
  role: Role | null,
): { doc: Doc; focus: number } {
  if (at === null || at > doc.lines.length) {
    const end = doc.lines.length;
    return { doc: insertLines(doc, end, [`[${name}]`, " "], [null, role]), focus: end + 1 };
  }
  return { doc: insertLines(doc, at, [`[${name}]`], [null]), focus: at + 1 };
}

/** Names of the sections in the lyrics, in order. */
export function sectionNames(lyrics: string): string[] {
  return responseRows(lyrics).flatMap((r) => (r.kind === "section" ? [r.text] : []));
}
