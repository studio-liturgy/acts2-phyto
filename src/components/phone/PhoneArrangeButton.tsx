import { useEffect, useRef, useState } from "react";
import { ListOrdered } from "lucide-react";
import { ArrangementRow } from "@/components/ArrangementRow";
import {
  effectiveArrangement,
  hiddenFromVisible,
  isAdjusted,
  sectionOptions,
  storedArrangement,
  visibleSections,
} from "@/lib/arrangements";
import { groupSlides } from "@/lib/sections";
import { useGatheringSections, useLibrary } from "@/lib/store";
import type { Set as PhytoSet } from "@/lib/types";

const NONE: Record<string, string[]> = {};
const TINTS = ["var(--brand-blue)", "var(--brand-green)", "var(--brand-orange)"];

/**
 * The gathering editor's arrangement button (the Phone view), fixed
 * bottom right, for the set being viewed. Faint until that set plays
 * differently from how it's written. Tapped, its sections splay out above it
 * as pills, top to bottom: a song's can be removed and any section added
 * (repeats included); a scripture's or message's can only be taken out and put
 * back. Saved per gathering, the same way as the presenter's.
 */
export function PhoneArrangeButton({
  gatheringId,
  set,
}: {
  gatheringId: string;
  set: PhytoSet | null | undefined;
}) {
  const [open, setOpen] = useState(false);
  const hidden = useGatheringSections((s) => s.hidden[gatheringId]) ?? NONE;
  const arranged = useGatheringSections((s) => s.arranged[gatheringId]) ?? NONE;
  const setHidden = useGatheringSections((s) => s.setHidden);
  const setArrangement = useGatheringSections((s) => s.setArrangement);
  const pushHiddenSections = useLibrary((s) => s.pushHiddenSections);
  const pushArrangements = useLibrary((s) => s.pushArrangements);
  const [blocked, setBlocked] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);

  // Tapping anywhere else folds the pills back (the "+" menu, which lives
  // outside this box, counts as inside).
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || wrap.current?.contains(t)) return;
      if (t.closest("[data-radix-popper-content-wrapper], [role='menu']")) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", off, true);
    return () => document.removeEventListener("pointerdown", off, true);
  }, [open]);

  // A different set in view folds the pills away.
  const setId = set?.id ?? null;
  useEffect(() => setOpen(false), [setId]);
  useEffect(() => {
    if (!blocked) return;
    const t = setTimeout(() => setBlocked(false), 2000);
    return () => clearTimeout(t);
  }, [blocked]);

  if (!set) return null;
  const song = set.kind === "song";
  const trims =
    (set.kind === "scripture" || set.kind === "message") && groupSlides(set.slides).length > 1;
  if (!(song && set.slides.length > 0) && !trims) return null;

  const adjusted = isAdjusted(set.kind, set.slides, arranged[set.id], hidden[set.id]);
  const arrangement = song
    ? effectiveArrangement(set.slides, arranged[set.id], hidden[set.id])
    : visibleSections(set.slides, hidden[set.id]);
  const change = (next: string[]) => {
    if (song) {
      const stored = storedArrangement(next, set.slides);
      setArrangement(gatheringId, set.id, stored);
      void pushArrangements(gatheringId, { ...arranged, [set.id]: stored });
    } else {
      const nextHidden = hiddenFromVisible(set.slides, next);
      setHidden(gatheringId, set.id, nextHidden);
      void pushHiddenSections(gatheringId, { ...hidden, [set.id]: nextHidden });
    }
  };

  return (
    <div
      ref={wrap}
      className="pointer-events-none absolute bottom-4 right-4 z-20 flex max-h-[calc(100%-2rem)] flex-col items-end gap-2"
    >
      <div
        // Splays up out of the button, and shrinks back into it.
        className={`catalogue-scroll min-h-0 origin-bottom-right overflow-y-auto transition-all duration-300 ease-out ${
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "translate-y-6 scale-50 opacity-0"
        }`}
        aria-hidden={!open}
      >
        {
          <ArrangementRow
            column
            solid
            removeOnly={!song}
            options={sectionOptions(set.slides)}
            arrangement={arrangement}
            tints={TINTS}
            onChange={change}
            onBlocked={() => setBlocked(true)}
          />
        }
      </div>
      {blocked && (
        <p className="mono pointer-events-none rounded-full bg-background px-3 py-1 text-[10px] uppercase tracking-wider">
          At least 1 section
        </p>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`pill pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center border border-foreground bg-background transition active:opacity-80 ${
          open || adjusted ? "" : "opacity-40"
        }`}
        title={open ? "Done arranging" : "Arrange sections"}
        aria-label={open ? "Done arranging" : "Arrange sections"}
        aria-pressed={open}
      >
        <ListOrdered className="h-4 w-4" />
      </button>
    </div>
  );
}
