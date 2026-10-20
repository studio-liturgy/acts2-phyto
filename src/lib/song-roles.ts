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

/** Call and Response alignment on the slides: Left (People indented),
 *  centred (absent), or split (Leader left, People right). */
export type RoleAlign = "left" | "split";

/** How a Call and Response song's roles show on its slides (and phones). */
export interface RoleStyle {
  /** Show role: a small grey L / P at the start of each reader's run. */
  marks?: boolean;
  align?: RoleAlign;
}

/** Does line `i` start a run of one reader's lines (where its mark goes)? */
export function startsRoleRun(roles: readonly (Role | null | undefined)[], i: number): boolean {
  const role = roles[i];
  return !!role && (i === 0 || roles[i - 1] !== role);
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

/** For each element of `a`, the index in `b` it pairs with (-1 if none):
 *  a longest-common-subsequence match on whole lines. */
function lcsPairs(a: string[], b: string[]): number[] {
  const n = a.length;
  const m = b.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = new Array<number>(n).fill(-1);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out[i] = j;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return out;
}

/**
 * Carry the roles across an edit of the lyrics. Lines that survive unchanged
 * keep theirs (matched as whole lines, so inserted slide breaks and moved
 * lines don't shift anyone). Between those, the changed lines pair up by
 * position, and any extra new line takes the role of the last changed line
 * before it (Enter at the end of a People line starts another People line).
 */
export function remapRoles(oldText: string, newText: string, roles: LineRoles): LineRoles {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const pairs = lcsPairs(a, b);
  const out: LineRoles = new Array(b.length).fill(null);
  let oi = 0;
  let nj = 0;
  const fillGap = (oEnd: number, nEnd: number) => {
    const old = roles.slice(oi, oEnd);
    const last = old.length ? (old[old.length - 1] ?? null) : null;
    for (let k = 0; nj + k < nEnd; k++) out[nj + k] = old[k] ?? last;
  };
  for (let i = 0; i < a.length; i++) {
    const j = pairs[i];
    if (j < 0) continue;
    fillGap(i, j);
    out[j] = roles[i] ?? null;
    oi = i + 1;
    nj = j + 1;
  }
  fillGap(a.length, b.length);
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
      ...(style.marks ? { roleMarks: true } : {}),
      ...(style.align ? { roleAlign: style.align } : {}),
    };
  });
}
