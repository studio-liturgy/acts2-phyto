import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Monitor, Pencil, Smartphone } from "lucide-react";
import { useLibrary } from "@/lib/store";
import { toPhoneSet } from "@/lib/gathering-phone-sets";
import { chordChangePatch } from "@/lib/chord-change";
import { loadPrefs, type ViewerPrefs } from "@/lib/phone-viewer";
import type { Set as PhytoSet } from "@/lib/types";
import { PhoneViewer } from "@/components/PhoneViewer";
import { RoleAlignRow } from "@/components/RoleAlignRow";
import { songLayoutOf } from "@/lib/song-layout";
import { PhoneScreen } from "@/components/phone/PhoneChrome";

export type PhoneEditorTab = "editor" | "phone" | "slides";

const TABS: { tab: PhoneEditorTab; label: string; Icon: typeof Pencil }[] = [
  { tab: "editor", label: "Editor", Icon: Pencil },
  { tab: "phone", label: "Phone", Icon: Smartphone },
  { tab: "slides", label: "Slides", Icon: Monitor },
];

/**
 * The Slides tab's list, with the gathering Desktop view's back-to-top button
 * (fades in once scrolled down a little).
 */
function SlidesScroller({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => setScrolled(el.scrollTop > 200);
    on();
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, []);
  return (
    <div className="relative min-h-0 flex-1">
      <div ref={ref} className="h-full overflow-y-auto overscroll-contain px-4 pb-10 pt-4">
        {children}
      </div>
      <button
        type="button"
        onClick={() => ref.current?.scrollTo({ top: 0, behavior: "smooth" })}
        className={`pill absolute bottom-4 right-4 z-20 flex h-11 w-11 items-center justify-center border border-foreground bg-background transition-all duration-300 active:opacity-80 ${
          scrolled ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0"
        }`}
        title="Back to top"
        aria-label="Back to top"
      >
        <ArrowUp className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * The set editor on a phone: the header, the body, and Editor / Phone /
 * Slides along the bottom. The editor stays mounted while another tab shows,
 * so typing, undo and the song search survive a look at the slides.
 */
export function PhoneSetTabs({
  header,
  editor,
  slides,
  set,
}: {
  header: ReactNode;
  editor: ReactNode;
  /** Absent: no Slides tab (media, whose editor is its slides). */
  slides?: ReactNode;
  set: PhytoSet;
}) {
  const [tab, setTab] = useState<PhoneEditorTab>("editor");
  const updateSet = useLibrary((s) => s.updateSet);
  const [prefs, setPrefs] = useState<ViewerPrefs>(() => loadPrefs());
  const phoneSets = useMemo(() => [toPhoneSet(set)], [set]);
  // The song's chords switched off: no chord rows, no key or letters/numbers.
  const chordsOff = !set.chords || !!set.chords.hidden;
  // Call and Response: Role and Align sit atop the Phone and Slides tabs.
  const roleRow =
    set.kind === "song" && songLayoutOf(set) === "response" ? (
      <div className="shrink-0 border-b border-foreground/15 bg-background px-4 py-2.5">
        <RoleAlignRow setId={set.id} phone />
      </div>
    ) : null;

  return (
    <PhoneScreen scroll={false} header={header}>
      <div className="flex h-full flex-col">
        <div className="relative min-h-0 flex-1">
          {/* Kept laid out while another tab shows (invisible, not display:
              none), so the grid's measured rows are there the moment you
              come back instead of re-measuring from zero. */}
          <div
            className={`h-full ${tab === "editor" ? "" : "pointer-events-none invisible absolute inset-0"}`}
          >
            {editor}
          </div>
          {tab === "phone" &&
            (set.slides.length === 0 ? (
              <p className="mono px-6 py-16 text-center text-xs uppercase tracking-wider text-muted-foreground">
                Nothing to show yet
              </p>
            ) : (
              <div className="flex h-full flex-col">
                {roleRow}
                <div className="relative min-h-0 flex-1 bg-black">
                  <PhoneViewer
                    sets={phoneSets}
                    embedded
                    bare
                    showSettings={false}
                    prefs={chordsOff ? { ...prefs, showChords: false } : prefs}
                    onPrefsChange={(p) =>
                      setPrefs(chordsOff ? { ...p, showChords: prefs.showChords } : p)
                    }
                    onChordChange={(setId, patch) => {
                      const p = chordChangePatch(set, patch);
                      if (p) updateSet(setId, p);
                    }}
                  />
                </div>
              </div>
            ))}
          {tab === "slides" && (
            <div className="flex h-full flex-col">
              {roleRow}
              <SlidesScroller>{slides}</SlidesScroller>
            </div>
          )}
        </div>
        {/* Across the full width, lit like the home tab bar. */}
        <nav className="phone-editor-tabs flex shrink-0 border-t border-foreground/15 bg-background px-1.5 pb-[env(safe-area-inset-bottom)]">
          {TABS.filter((t) => t.tab !== "slides" || slides !== undefined).map(
            ({ tab: t, label, Icon }) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex h-[54px] flex-1 items-center justify-center transition-colors ${
                  tab === t ? "text-foreground" : "text-foreground/35"
                }`}
                title={label}
                aria-label={label}
                aria-pressed={tab === t}
              >
                <Icon className="h-[23px] w-[23px]" strokeWidth={1.5} />
              </button>
            ),
          )}
        </nav>
      </div>
    </PhoneScreen>
  );
}
