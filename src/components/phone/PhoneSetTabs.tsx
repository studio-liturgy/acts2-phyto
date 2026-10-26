import { useMemo, useState, type ReactNode } from "react";
import { useLibrary } from "@/lib/store";
import { toPhoneSet } from "@/lib/gathering-phone-sets";
import { chordChangePatch } from "@/lib/chord-change";
import { loadPrefs, type ViewerPrefs } from "@/lib/phone-viewer";
import type { Set as PhytoSet } from "@/lib/types";
import { PhoneViewer } from "@/components/PhoneViewer";
import { PhoneScreen } from "@/components/phone/PhoneChrome";

export type PhoneEditorTab = "editor" | "phone" | "slides";

const TABS: { tab: PhoneEditorTab; label: string }[] = [
  { tab: "editor", label: "Editor" },
  { tab: "phone", label: "Phone" },
  { tab: "slides", label: "Slides" },
];

/**
 * The set editor on a phone: the header, then Editor / Phone / Slides. The
 * editor stays mounted while another tab shows, so typing, undo and the song
 * search survive a look at the slides.
 */
export function PhoneSetTabs({
  header,
  editor,
  slides,
  set,
}: {
  header: ReactNode;
  editor: ReactNode;
  slides: ReactNode;
  set: PhytoSet;
}) {
  const [tab, setTab] = useState<PhoneEditorTab>("editor");
  const updateSet = useLibrary((s) => s.updateSet);
  const [prefs, setPrefs] = useState<ViewerPrefs>(() => loadPrefs());
  const phoneSets = useMemo(() => [toPhoneSet(set)], [set]);

  return (
    <PhoneScreen
      scroll={false}
      header={
        <>
          {header}
          <div className="flex shrink-0 justify-center gap-2 border-b border-foreground/20 px-4 py-2.5">
            {TABS.map(({ tab: t, label }) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`pill mono uppercase px-4 py-1.5 text-xs tracking-wider transition ${
                  tab === t ? "bg-foreground text-background" : "border border-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      }
    >
      <div className={`h-full ${tab === "editor" ? "" : "hidden"}`}>{editor}</div>
      {tab === "phone" &&
        (set.slides.length === 0 ? (
          <p className="mono px-6 py-16 text-center text-xs uppercase tracking-wider text-muted-foreground">
            Nothing to show yet
          </p>
        ) : (
          <div className="relative h-full bg-black">
            <PhoneViewer
              sets={phoneSets}
              embedded
              prefs={prefs}
              onPrefsChange={setPrefs}
              onChordChange={(setId, patch) => {
                const p = chordChangePatch(set, patch);
                if (p) updateSet(setId, p);
              }}
            />
          </div>
        ))}
      {tab === "slides" && (
        <div className="h-full overflow-y-auto overscroll-contain px-4 pb-10 pt-4">{slides}</div>
      )}
    </PhoneScreen>
  );
}
