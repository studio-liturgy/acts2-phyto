import type { Set as PhytoSet } from "@/lib/types";

/** Where a media set's auto advance goes from the live slide, and after how
 *  long; null when it doesn't advance (off, stopped, a video still playing,
 *  the last slide of a set that doesn't loop). Shared by the desktop
 *  presenter and the phone remote. */
export function autoAdvanceStep(
  set: PhytoSet | null | undefined,
  slideId: string | null | undefined,
  opts: { blackout?: boolean; videoEnded?: boolean },
): { ms: number; nextSlideId: string } | null {
  if (!set || set.kind !== "media") return null;
  const ms = set.autoAdvanceMs ?? 0;
  if (ms <= 0 || !slideId || opts.blackout) return null;
  const slides = set.slides;
  const idx = slides.findIndex((s) => s.id === slideId);
  if (idx === -1) return null;
  // A video holds the delay until it has finished playing.
  if (slides[idx].kind === "video" && !opts.videoEnded) return null;
  const next = slides[idx + 1];
  // Loop within the section: a divider after this slide (or the end of the
  // set) sends playback back to the section's first slide.
  if (set.loop && set.loopSection) {
    const atSectionEnd = slides[idx].sectionAfter !== undefined || !next;
    if (atSectionEnd) {
      let start = idx;
      while (start > 0 && slides[start - 1].sectionAfter === undefined) start -= 1;
      return { ms, nextSlideId: slides[start].id };
    }
  }
  if (next) return { ms, nextSlideId: next.id };
  if (set.loop && slides[0]) return { ms, nextSlideId: slides[0].id };
  return null;
}
