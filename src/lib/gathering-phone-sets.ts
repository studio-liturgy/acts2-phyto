import { useMemo } from "react";
import { useLibrary } from "./store";
import type { PhoneSet } from "./phone-viewer";
import { visibleVersions } from "./versions";
import { songLangs } from "./multiling";
import type { Set as PhytoSet } from "./types";

/** The gathering's sets as the phone view gets them, in order. */
export function useGatheringPhoneSets(gatheringId: string): PhoneSet[] {
  const setIds = useLibrary((s) => s.gatherings[gatheringId]?.setIds);
  const sets = useLibrary((s) => s.sets);
  return useMemo(
    () =>
      (setIds ?? [])
        .map((id) => sets[id])
        .filter((d): d is PhytoSet => !!d)
        .map((d) => ({
          id: d.id,
          title: d.name,
          type: d.kind,
          slides: d.slides,
          chords: d.chords,
          versions: visibleVersions(d),
          ...(songLangs(d).length ? { langs: songLangs(d), langsShown: d.langsShown } : {}),
        })),
    [setIds, sets],
  );
}
