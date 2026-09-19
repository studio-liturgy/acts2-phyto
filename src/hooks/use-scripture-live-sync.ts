import { useEffect, useRef } from "react";
import { useLibrary } from "@/lib/store";
import { parseScriptureFromText, reconcileSlideIds, slidesToScriptureText } from "@/lib/slide-text";
import type { SetKind } from "@/lib/types";

/**
 * Live sync for the scripture editor's verse box: rebuild the set's slides
 * whenever the text changes, reconciled against the stored slides so an
 * unchanged round-trip keeps every slide id and skips the write (otherwise
 * merely opening the editor would bump updatedAt and push regenerated ids,
 * which reads as a real content conflict on other devices).
 *
 * Guarded against the message -> scripture flip. A message owns its slides in
 * the block editor and never fills this box, so when its last point or image
 * is removed and the set becomes a plain scripture again, the box is empty (or
 * stale from before it became a message). Syncing that over the verses would
 * wipe them. On that transition the box is seeded from the current verse
 * slides instead; the re-render then syncs the seeded text, which reconciles
 * back to the same slides.
 */
export function useScriptureLiveSync({
  kind,
  setId,
  manualText,
  setManualText,
  versesPer,
}: {
  kind: SetKind;
  setId: string;
  manualText: string;
  setManualText: (text: string) => void;
  versesPer: number;
}): void {
  const updateSet = useLibrary((s) => s.updateSet);
  const lastKindRef = useRef(kind);
  useEffect(() => {
    if (kind !== "scripture") {
      lastKindRef.current = kind;
      return;
    }
    if (lastKindRef.current !== "scripture") {
      lastKindRef.current = kind;
      setManualText(slidesToScriptureText(useLibrary.getState().sets[setId]?.slides ?? []));
      return;
    }
    const parsed = manualText.trim() ? parseScriptureFromText(manualText, versesPer) : [];
    const current = useLibrary.getState().sets[setId]?.slides ?? [];
    const { slides, changed } = reconcileSlideIds(parsed, current);
    if (changed) updateSet(setId, { slides });
  }, [manualText, versesPer, kind, setId, updateSet, setManualText]);
}
