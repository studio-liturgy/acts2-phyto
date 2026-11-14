import { useEffect } from "react";
import { autoAdvanceStep } from "@/lib/media-auto-advance";
import { useLibrary, useLive } from "@/lib/store";

/** Runs a live media set's auto advance. Mounted by whatever drives the
 *  slides: the desktop presenter and the phone remote. */
export function MediaAutoAdvance() {
  const setId = useLive((s) => s.setId);
  const slideId = useLive((s) => s.slideId);
  const blackout = useLive((s) => s.blackout);
  const videoEnded = useLive((s) => s.videoEnded);
  const phytoSet = useLibrary((s) => (setId ? s.sets[setId] : null));
  useEffect(() => {
    // For a video, the effect re-runs when `videoEnded` flips to true (set
    // by the output window or the screen link).
    const step = autoAdvanceStep(phytoSet, slideId, { blackout, videoEnded });
    if (!phytoSet || !step) return;
    const t = setTimeout(() => useLive.getState().go(phytoSet.id, step.nextSlideId), step.ms);
    return () => clearTimeout(t);
  }, [phytoSet, slideId, blackout, videoEnded]);
  return null;
}
