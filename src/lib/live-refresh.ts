import type { LiveState } from "./types";

/** Clicking the slide that's already live again re-applies the song or
 *  scripture template on the output (a template change otherwise waits for the
 *  next slide). `refresh` counts those clicks; going to another slide keeps it. */
export function refreshAfterGo(
  live: Pick<LiveState, "setId" | "slideId" | "slideOcc" | "refresh">,
  setId: string,
  slideId: string,
  occ: number,
): number {
  const same = live.setId === setId && live.slideId === slideId && (live.slideOcc ?? 0) === occ;
  return (live.refresh ?? 0) + (same ? 1 : 0);
}
