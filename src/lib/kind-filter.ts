// Catalogue kind filter (home chips and the presenter's coloured dots). Each
// colour cycles through its own steps on click, then back to off:
//   blue:   all songs, chords on, Multi-Language, Call and Response, off
//   green:  all scriptures (messages included), messages, off
//   orange: media, off
// Song steps show the song's catalogue pattern (song-layout.ts) on the chip,
// and Messages the message green, so the step reads without a label.
import type { Set as PhytoSet } from "./types";
import { songLayoutOf, type SongPattern } from "./song-layout";

export type KindStep =
  | "song"
  | "song-chords"
  | "song-multilang"
  | "song-response"
  | "scripture"
  | "message"
  | "media";

export type KindColor = "song" | "scripture" | "media";

export const KIND_CYCLE: Record<KindColor, readonly KindStep[]> = {
  song: ["song", "song-chords", "song-multilang", "song-response"],
  scripture: ["scripture", "message"],
  media: ["media"],
};

/** Tooltip for the click that moves to a step. */
export const KIND_STEP_LABEL: Record<KindStep, string> = {
  song: "Show songs",
  "song-chords": "Show songs with chords",
  "song-multilang": "Show Multi-Language songs",
  "song-response": "Show Call and Response songs",
  scripture: "Show scriptures",
  message: "Show messages",
  media: "Show media",
};

/** The colour a step belongs to, or null for any other filter value. */
export function kindColorOf(filter: string): KindColor | null {
  for (const color of Object.keys(KIND_CYCLE) as KindColor[]) {
    if ((KIND_CYCLE[color] as readonly string[]).includes(filter)) return color;
  }
  return null;
}

/** Next filter after clicking a colour: its first step when another filter (or
 *  none) is on, else its next step, and off ("all") after the last. */
export function nextKindFilter(current: string, color: KindColor): KindStep | "all" {
  const steps = KIND_CYCLE[color];
  const i = (steps as readonly string[]).indexOf(current);
  if (i === -1) return steps[0];
  return i + 1 < steps.length ? steps[i + 1] : "all";
}

/** Whether a set passes a kind step. */
export function matchesKindStep(
  set: Pick<PhytoSet, "kind" | "songLayout" | "chords">,
  step: KindStep,
): boolean {
  switch (step) {
    case "song":
      return set.kind === "song";
    case "song-chords":
      return set.kind === "song" && !!set.chords && !set.chords.hidden;
    case "song-multilang":
      return set.kind === "song" && songLayoutOf(set) === "multilang";
    case "song-response":
      return set.kind === "song" && songLayoutOf(set) === "response";
    case "scripture":
      return set.kind === "scripture" || set.kind === "message";
    case "message":
      return set.kind === "message";
    case "media":
      return set.kind === "media";
  }
}

/** The pattern a step's chip carries (song steps only). */
export function kindStepPatterns(step: string): SongPattern[] {
  if (step === "song-chords") return ["lines"];
  if (step === "song-multilang") return ["grid"];
  if (step === "song-response") return ["hatch"];
  return [];
}

/** The fill colour of a step's chip. */
export function kindStepColor(step: string): string {
  if (step === "message") return "var(--brand-green-dark)";
  const color = kindColorOf(step);
  if (color === "song") return "var(--brand-blue)";
  if (color === "scripture") return "var(--brand-green)";
  return "var(--brand-orange)";
}
