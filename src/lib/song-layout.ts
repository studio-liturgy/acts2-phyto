// A song's layout (Song Settings): Standard, Multilanguage or Call and Response,
// plus Chords, a switch that works with any of them. Each shows as a faint
// pattern over the song's blue wherever a set is listed (the home catalogue
// pill, the presenter's set dots), so a leader can tell them apart at a glance.
import type { Set as PhytoSet } from "./types";

export type SongLayout = "standard" | "multilang" | "response";

/** The modes, in menu order, with their names. */
export const SONG_LAYOUTS: readonly { value: SongLayout; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "multilang", label: "Multi-Language" },
  { value: "response", label: "Call and Response" },
];

/** A set's layout. Absent (every song before Song Settings) is Standard. */
export function songLayoutOf(set: Pick<PhytoSet, "kind" | "songLayout">): SongLayout {
  if (set.kind !== "song") return "standard";
  return set.songLayout ?? "standard";
}

export type SongPattern = "lines" | "grid" | "hatch";

/** The patterns drawn over a song, bottom first: chords (dots) under the
 *  mode's pattern (Multi-Language grid, Call and Response hatching). */
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
 * The patterns as CSS background layers, drawn in a faint white over the
 * pill's own colour. Chords are small dots, Multi-Language a grid, Call and
 * Response cross hatching. `period` is the spacing in px: the home pill uses
 * 6, the presenter's 12px dot 4 (three across it).
 */
export function songPatternStyle(
  patterns: SongPattern[],
  period: number,
  alpha = 0.12,
): { backgroundImage?: string; backgroundSize?: string } {
  if (patterns.length === 0) return {};
  const ink = `rgba(255, 255, 255, ${alpha})`;
  const layers: { image: string; size: string }[] = [];
  const add = (image: string, size = "auto") => {
    if (!layers.some((l) => l.image === image)) layers.push({ image, size });
  };
  const stripe = (angle: number) =>
    `repeating-linear-gradient(${angle}deg, ${ink} 0 1px, transparent 1px ${period}px)`;
  for (const p of patterns) {
    if (p === "lines") {
      // A dot is fainter than a line at the same ink, so it's a little stronger.
      const dot = `rgba(255, 255, 255, ${Math.min(1, alpha * 1.8)})`;
      add(`radial-gradient(circle, ${dot} 0 0.8px, transparent 1.2px)`, `${period}px ${period}px`);
    }
    if (p === "grid") {
      add(stripe(0));
      add(stripe(90));
    }
    if (p === "hatch") {
      add(stripe(45));
      add(stripe(-45));
    }
  }
  return {
    backgroundImage: layers.map((l) => l.image).join(", "),
    backgroundSize: layers.map((l) => l.size).join(", "),
  };
}
