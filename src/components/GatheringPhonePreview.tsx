import { useEffect, useState } from "react";
import { PhoneViewer } from "@/components/PhoneViewer";
import {
  gatheringSectionsReady,
  loadGatheringSections,
  useGatheringSections,
  useLibrary,
} from "@/lib/store";
import { loadPrefs, phoneSetHasChords, type ViewerPrefs } from "@/lib/phone-viewer";
import { useGatheringPhoneSets } from "@/lib/gathering-phone-sets";

const NONE: Record<string, string[]> = {};

/**
 * The phone view of a gathering in the presenter's phone frame, for the Go
 * live / Share dialog: tabs and scrolling work, chords switch on and off
 * (the switch under the phone), nothing edits the sets.
 */
export function GatheringPhonePreview({ gatheringId }: { gatheringId: string }) {
  const phoneSets = useGatheringPhoneSets(gatheringId);
  const hidden = useGatheringSections((s) => s.hidden[gatheringId]) ?? NONE;
  const arranged = useGatheringSections((s) => s.arranged[gatheringId]) ?? NONE;
  const arrangementsOn = useLibrary((s) => s.workspaceSettings.arrangements);
  const [prefs, setPrefs] = useState<ViewerPrefs>(() => loadPrefs());
  const [activeId, setActiveId] = useState<string | null>(phoneSets[0]?.id ?? null);
  const hasChords = phoneSets.some(phoneSetHasChords);
  // Hidden sections and arrangements, as phones get them (the home page may
  // not have read them yet).
  useEffect(() => {
    if (!gatheringSectionsReady(useGatheringSections.getState(), gatheringId)) {
      void loadGatheringSections(gatheringId);
    }
  }, [gatheringId]);

  return (
    <div className="flex h-full flex-col items-center gap-3">
      <div
        className="min-h-0 flex-1 overflow-hidden rounded-[2rem] border border-foreground/25 bg-black"
        style={{ width: 340 }}
      >
        <PhoneViewer
          sets={phoneSets}
          hiddenBySet={hidden}
          arrangementsBySet={arrangementsOn ? arranged : undefined}
          embedded
          showSettings={false}
          prefs={prefs}
          onPrefsChange={setPrefs}
          activeId={activeId}
          onActiveChange={setActiveId}
        />
      </div>
      {hasChords && (
        <label className="flex items-center gap-3">
          <span className="mono text-[10px] uppercase tracking-wider">Chords</span>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.showChords}
            aria-label="Show chords"
            onClick={() => setPrefs((p) => ({ ...p, showChords: !p.showChords }))}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
              prefs.showChords ? "bg-foreground" : "bg-foreground/25"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-background transition-transform ${
                prefs.showChords ? "translate-x-[18px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </label>
      )}
    </div>
  );
}
