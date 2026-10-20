// A song's layout (Song Settings): Standard, Multilanguage or Call and Response,
// plus Chords, a switch that works with any of them. Each shows as a faint
// pattern over the song's blue wherever a set is listed (the home catalogue
// pill, the presenter's set dots), so a leader can tell them apart at a glance.
import type { Set as PhytoSet } from "./types";

export type SongLayout = "standard" | "multilang" | "response";

/** The modes, in menu order, with their names. */
export const SONG_LAYOUTS: readonly { value: SongLayout; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "multilang", label: "Multilanguage" },
  { value: "response", label: "Call and Response" },
];

/** A set's layout. Absent (every song before Song Settings) is Standard. */
export function songLayoutOf(set: Pick<PhytoSet, "kind" | "songLayout">): SongLayout {
  if (set.kind !== "song") return "standard";
  return set.songLayout ?? "standard";
}

export type SongPattern = "lines" | "grid" | "hatch";

/** The patterns drawn over a song, bottom first. Chords are horizontal lines,
 *  Multilanguage a grid, Call and Response cross hatching. Chords stack under
 *  the layout's pattern (under a grid they disappear into it, so a
 *  Multilanguage song with chords reads as Multilanguage). */
export function songPatterns(set: Pick<PhytoSet, "kind" | "songLayout" | "chords">): SongPattern[] {
  if (set.kind !== "song") return [];
  const out: SongPattern[] = [];
  if (set.chords && !set.chords.hidden) out.push("lines");
  const layout = songLayoutOf(set);
  if (layout === "multilang") out.push("grid");
  if (layout === "response") out.push("hatch");
  return out;
}

/**
 * CSS `background-image` for the patterns, drawn in a faint white over the
 * pill's own colour. `period` is the spacing in px: the home pill uses 6, the
 * presenter's 12px dot 4 (three stripes across it).
 */
export function songPatternImage(
  patterns: SongPattern[],
  period: number,
  alpha = 0.12,
): string | undefined {
  if (patterns.length === 0) return undefined;
  const ink = `rgba(255, 255, 255, ${alpha})`;
  const stripe = (angle: number) =>
    `repeating-linear-gradient(${angle}deg, ${ink} 0 1px, transparent 1px ${period}px)`;
  const layers: string[] = [];
  for (const p of patterns) {
    if (p === "lines") layers.push(stripe(0));
    if (p === "grid") layers.push(stripe(0), stripe(90));
    if (p === "hatch") layers.push(stripe(45), stripe(-45));
  }
  return [...new Set(layers)].join(", ");
}
