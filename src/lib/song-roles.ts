// Call and Response: who reads each line of a liturgy.
//
// A role is stored as a plain label at the start of the lyric line itself,
// "People: Thanks be to God", the same way chords and **bold** live inline. So
// it survives sync, export, sharing and older builds with no extra field, and an
// older build that knows nothing about roles still shows the label as text.
// Renderers that do know (slides, phones) style the label and set the People
// and All lines in bold.
import { isChordOnlyLine } from "./chords";

export type Role = "leader" | "people" | "all";

export const ROLES: readonly Role[] = ["leader", "people", "all"];

export const ROLE_LABEL: Record<Role, string> = {
  leader: "Leader",
  people: "People",
  all: "All",
};

/** One letter for the editor's gutter toggle. */
export const ROLE_LETTER: Record<Role, string> = { leader: "L", people: "P", all: "A" };

const ROLE_RE = /^(Leader|People|All):[ \t]*/;

const BY_LABEL: Record<string, Role> = { Leader: "leader", People: "people", All: "all" };

/** A line's role (if it opens with a role label) and the words after it. */
export function splitRole(line: string): { role?: Role; text: string } {
  const m = ROLE_RE.exec(line);
  if (!m) return { text: line };
  return { role: BY_LABEL[m[1]], text: line.slice(m[0].length) };
}

/** The line carrying `role` (or none), whatever role it had before. */
export function withRole(line: string, role: Role | undefined): string {
  const { text } = splitRole(line);
  return role ? `${ROLE_LABEL[role]}: ${text}` : text;
}

/** The gutter toggle's cycle: none, Leader, People, All, back to none. */
export function nextRole(role: Role | undefined): Role | undefined {
  if (!role) return "leader";
  const i = ROLES.indexOf(role);
  return i === ROLES.length - 1 ? undefined : ROLES[i + 1];
}

/** People and All read together, so their lines are set in bold. */
export function isBoldRole(role: Role | undefined): boolean {
  return role === "people" || role === "all";
}

/** Can a stored lyric line take a role? Not a blank, a `---` slide break or a
 *  `[Section]` label. */
export function canTakeRole(line: string): boolean {
  const t = line.trim();
  return t !== "" && t !== "---" && !/^\[.+\]$/.test(t);
}

/** Stored lyrics with line `index` cycled to its next role. */
export function cycleLineRole(lyrics: string, index: number): string {
  const lines = lyrics.split("\n");
  const line = lines[index];
  if (line === undefined || !canTakeRole(line)) return lyrics;
  lines[index] = withRole(line, nextRole(splitRole(line).role));
  return lines.join("\n");
}

/** One toggle in the editor's role gutter: the box line it sits beside and the
 *  stored line it changes. */
export interface RoleGutterRow {
  boxLine: number;
  storedLine: number;
  role?: Role;
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
  boxText: string,
  layout: { storedLine: number | null; kind: string }[] | null,
): RoleGutterRow[] {
  const stored = lyrics.split("\n");
  const box = boxText.split("\n");
  const rows: RoleGutterRow[] = [];
  const add = (boxLine: number, storedLine: number) => {
    const line = stored[storedLine];
    if (line === undefined || !canTakeRole(box[boxLine] ?? "")) return;
    if (isChordOnlyLine(line.trim())) return;
    rows.push({ boxLine, storedLine, role: splitRole(line).role });
  };
  if (!layout) {
    for (let i = 0; i < box.length; i++) add(i, i);
    return rows;
  }
  layout.forEach((l, j) => {
    if ((l.kind === "lyric" || l.kind === "plain") && l.storedLine !== null) add(j, l.storedLine);
  });
  return rows;
}
