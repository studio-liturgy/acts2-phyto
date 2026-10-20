// The Call and Response grid's model: a view over the plain lyrics text (the
// same text the plain editor holds and the slides are parsed from), one grid
// row per stored line. `[Label]` lines are section rows, `---` lines are slide
// breaks, blank lines are skipped, and every other line is a lyric row with
// its reader (the roles array runs alongside the text, one entry per line).
//
// Every edit returns the new text AND the new roles together, so the two can
// never drift apart.
import type { LineRoles, Role } from "./song-roles";

export type ResponseRow =
  | { kind: "section"; index: number; text: string }
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

export function responseRows(lyrics: string): ResponseRow[] {
  const out: ResponseRow[] = [];
  let n = 0;
  lyrics.split("\n").forEach((line, index) => {
    const sec = SECTION_RE.exec(line);
    if (sec) {
      out.push({ kind: "section", index, text: sec[1] });
      n = 0;
    } else if (BREAK_RE.test(line)) {
      out.push({ kind: "break", index });
      n = 0;
    } else if (line.trim()) {
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
    const l = lines[i];
    if (l.trim() && !SECTION_RE.test(l) && !BREAK_RE.test(l)) return i;
  }
  return -1;
}
