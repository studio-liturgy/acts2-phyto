// Call and Response: who reads each line of a liturgy.
//
// Roles live beside the words, never in them: a slide carries `roles`, one
// entry per line of `lines` (null = no role). The words stay exactly as typed,
// so switching the song out of Call and Response leaves no labels behind. Out
// of that mode the same array is kept as `hiddenRoles`, which no renderer
// reads, so switching back brings every role back.
//
// In the editor the lyrics box holds only words; a parallel array holds one
// role per stored lyrics line, and edits carry it along.
import type { Slide } from "./types";
import { isChordOnlyLine } from "./chords";

export type Role = "leader" | "people";

/** One entry per stored line; null = no role (JSON keeps null, not undefined). */
export type LineRoles = (Role | null)[];

export const ROLES: readonly Role[] = ["leader", "people"];

export const ROLE_LABEL: Record<Role, string> = {
  leader: "Leader",
  people: "People",
};

/** One letter for the editor's gutter toggle. */
export const ROLE_LETTER: Record<Role, string> = { leader: "L", people: "P" };

/** The gutter toggle's cycle: none, Leader, People, back to none. */
export function nextRole(role: Role | null | undefined): Role | null {
  if (!role) return "leader";
  const i = ROLES.indexOf(role);
  return i === ROLES.length - 1 ? null : ROLES[i + 1];
}

/** The people's lines are set in bold. */
export function isBoldRole(role: Role | null | undefined): boolean {
  return role === "people";
}

/** How a Call and Response song's roles show on its slides (and phones). */
export interface RoleStyle {
  /** Hide Role: no "Leader:" / "People:" name in front of the line. */
  hideNames?: boolean;
  /** Align L/R: Leader lines sit on the left, People lines on the right. */
  sides?: boolean;
}

/** Does this stored lyrics line become a slide line? Not a blank, a `---`
 *  slide break or a `[Section]` label (mirrors parseLyricsFromText). */
function isSlideLine(line: string): boolean {
  const t = line.trim();
  return t !== "" && !/^---\s*$/.test(t) && !/^\[.+\]$/.test(t);
}

/** Can a stored line take a role? A slide line that isn't instrumental. */
export function canTakeRole(line: string): boolean {
  return isSlideLine(line) && !isChordOnlyLine(line.trim());
}

/**
 * Carry the roles across an edit of the lyrics. Lines unchanged at the start
 * and at the end keep theirs; the changed run in between pairs up by position,
 * and any extra new lines take the role of the last line in that run (Enter at
 * the end of a People line starts another People line).
 */
export function remapRoles(oldText: string, newText: string, roles: LineRoles): LineRoles {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (
    suf < a.length - pre &&
    suf < b.length - pre &&
    a[a.length - 1 - suf] === b[b.length - 1 - suf]
  )
    suf++;
  const out: LineRoles = [];
  for (let i = 0; i < pre; i++) out.push(roles[i] ?? null);
  const oldMid = roles.slice(pre, a.length - suf);
  const last = oldMid.length ? (oldMid[oldMid.length - 1] ?? null) : null;
  for (let k = 0; k < b.length - suf - pre; k++) out.push(oldMid[k] ?? last);
  for (let i = a.length - suf; i < a.length; i++) out.push(roles[i] ?? null);
  // Lines that can't take a role (blanks, ---, labels) never keep one.
  return out.map((r, i) => (r && canTakeRole(b[i] ?? "") ? r : null));
}

/** The stored lyrics' line roles from the slides they made (inverse of
 *  attachRoles), from `roles` or, out of the mode, `hiddenRoles`. */
export function rolesFromSlides(text: string, slides: Slide[]): LineRoles {
  const flat: (Role | null)[] = slides.flatMap((s) =>
    (s.lines ?? []).map((_, i) => (s.roles ?? s.hiddenRoles)?.[i] ?? null),
  );
  let k = 0;
  return text.split("\n").map((line) => (isSlideLine(line) ? (flat[k++] ?? null) : null));
}

/**
 * Put the editor's line roles onto the slides parsed from the same lyrics:
 * as `roles` in Call and Response, `hiddenRoles` otherwise (kept, not shown).
 * A slide with no roles at all gets neither field.
 */
export function attachRoles(
  slides: Slide[],
  text: string,
  roles: LineRoles,
  shown: boolean,
  style: RoleStyle = {},
): Slide[] {
  const flat: (Role | null)[] = [];
  text.split("\n").forEach((line, i) => {
    if (isSlideLine(line)) flat.push(roles[i] ?? null);
  });
  let k = 0;
  return slides.map((s) => {
    const mine = (s.lines ?? []).map(() => flat[k++] ?? null);
    if (!mine.some(Boolean)) return s;
    if (!shown) return { ...s, hiddenRoles: mine };
    return {
      ...s,
      roles: mine,
      ...(style.hideNames ? { hideRoleNames: true } : {}),
      ...(style.sides ? { roleSides: true } : {}),
    };
  });
}

/** One toggle in the editor's role gutter: the box line it sits beside and the
 *  stored line it changes. */
export interface RoleGutterRow {
  boxLine: number;
  storedLine: number;
  role: Role | null;
}

/**
 * The gutter's toggles for the lyrics box. With chords hidden the box shows
 * the stored lines one for one; with chords shown (`layout`, from
 * chordRowLayout) each chorded line takes two box lines and the toggle sits on
 * the lyric, not its chord row. Instrumental (chord-only) lines, blanks,
 * `---` and `[Section]` labels get no toggle.
 */
export function roleGutterRows(
  lyrics: string,
  roles: LineRoles,
  layout: { storedLine: number | null; kind: string }[] | null,
): RoleGutterRow[] {
  const stored = lyrics.split("\n");
  const rows: RoleGutterRow[] = [];
  const add = (boxLine: number, storedLine: number) => {
    const line = stored[storedLine];
    if (line === undefined || !canTakeRole(line)) return;
    rows.push({ boxLine, storedLine, role: roles[storedLine] ?? null });
  };
  if (!layout) {
    stored.forEach((_, i) => add(i, i));
    return rows;
  }
  layout.forEach((l, j) => {
    if ((l.kind === "lyric" || l.kind === "plain") && l.storedLine !== null) add(j, l.storedLine);
  });
  return rows;
}
