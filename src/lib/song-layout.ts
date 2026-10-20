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
 *
 * Every layer is tiled from the same top-left origin, so the chord dots land
 * exactly on the pattern's crossings: the grid's corners, or the hatching's
 * diagonal crossings (tile centres and corners). Alone, they sit on the grid's
 * points.
 */
export function songPatternStyle(
  patterns: SongPattern[],
  period: number,
  alpha = 0.12,
): { backgroundImage?: string; backgroundSize?: string; backgroundPosition?: string } {
  if (patterns.length === 0) return {};
  const ink = `rgba(255, 255, 255, ${alpha})`;
  // A dot is fainter than a line at the same ink, so it's a little stronger.
  const dotInk = `rgba(255, 255, 255, ${Math.min(1, alpha * 1.8)})`;
  const hatch = patterns.includes("hatch");
  const grid = patterns.includes("grid");
  // Hatching tiles are wider so its parallel lines sit `period` apart.
  const tile = hatch && !grid ? period * Math.SQRT2 : period;
  const px = (n: number) => `${Number(n.toFixed(2))}px`;
  const size = `${px(tile)} ${px(tile)}`;
  const layers: { image: string; position: string }[] = [];
  const dot = (cx: number) => ({
    image: `radial-gradient(circle at ${px(cx)} ${px(cx)}, ${dotInk} 0 0.8px, transparent 1.2px)`,
    position: "0 0",
  });
  if (patterns.includes("lines")) {
    if (hatch && !grid) {
      // The diagonals cross at each tile's centre and at its corners. A corner
      // dot is drawn as a centre dot shifted by half a tile.
      layers.push(dot(tile / 2));
      layers.push({ ...dot(tile / 2), position: `${px(tile / 2)} ${px(tile / 2)}` });
    } else {
      // On the grid's corners (lines start at 0 in each tile): a centre dot
      // shifted up and left by half a tile, less half a line.
      const shift = px(-(tile / 2 - 0.5));
      layers.push({ ...dot(tile / 2), position: `${shift} ${shift}` });
    }
  }
  if (grid) {
    layers.push({
      image: `linear-gradient(90deg, ${ink} 0 1px, transparent 1px)`,
      position: "0 0",
    });
    layers.push({
      image: `linear-gradient(180deg, ${ink} 0 1px, transparent 1px)`,
      position: "0 0",
    });
  }
  if (hatch) {
    // Both diagonals of each tile: continuous lines across the tiling.
    const band = `transparent calc(50% - 0.5px), ${ink} calc(50% - 0.5px) calc(50% + 0.5px), transparent calc(50% + 0.5px)`;
    layers.push({ image: `linear-gradient(45deg, ${band})`, position: "0 0" });
    layers.push({ image: `linear-gradient(-45deg, ${band})`, position: "0 0" });
  }
  return {
    backgroundImage: layers.map((l) => l.image).join(", "),
    backgroundSize: layers.map(() => size).join(", "),
    backgroundPosition: layers.map((l) => l.position).join(", "),
  };
}
