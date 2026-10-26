import { guessKey, transposeLyrics } from "./chords";
import type { Set as PhytoSet } from "./types";

/**
 * A song's key or letters/numbers changed from a phone view that edits the
 * set (the presenter's phone preview, the phone layout's gathering screen):
 * the patch to store. A key change transposes the stored lyrics too, so
 * `chords.key` stays the truth about what's written. Null = nothing changes.
 */
export function chordChangePatch(
  d: Pick<PhytoSet, "slides" | "chords">,
  patch: { key?: string; display?: "letters" | "numbers" },
): Partial<PhytoSet> | null {
  const joined = d.slides.flatMap((sl) => sl.lines ?? []).join("\n");
  const chords = d.chords ?? { key: guessKey(joined) ?? "G", display: "letters" as const };
  let out: Partial<PhytoSet> | null = null;
  let next = chords;
  if (patch.display && patch.display !== chords.display) {
    next = { ...next, display: patch.display };
    out = { chords: next };
  }
  if (patch.key && patch.key !== chords.key) {
    const from = chords.key;
    const to = patch.key;
    const slides = d.slides.map((sl) =>
      sl.lines ? { ...sl, lines: sl.lines.map((l) => transposeLyrics(l, from, to)) } : sl,
    );
    next = { ...next, key: to };
    out = { slides, chords: next };
  }
  return out;
}
