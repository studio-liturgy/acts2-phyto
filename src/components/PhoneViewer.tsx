import { useEffect, useRef, useState } from "react";
import { ChordLine } from "@/components/ChordLine";
import { guessKey, KEYS, parseChordLine, transposeLyrics, type SongChords } from "@/lib/chords";
import { groupSlides, hiddenSlideIndices } from "@/lib/sections";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Pencil } from "lucide-react";
import { Switch } from "@/components/ui/switch";

// The phone gathering view, as a self-contained presentational component. Two
// surfaces render it identically:
//   · /g/<token> — congregants, fed by Supabase rows.
//   · the presenter's "mobile" preview — the leader, fed by local library data.
// Keeping one component is what makes the preview a faithful mirror.

// ---------------------------------------------------------------------------
// Public shapes — the minimal set/slide the viewer needs, so callers can map
// either a raw Supabase row or a local `Set` onto it.
// ---------------------------------------------------------------------------

export interface PhoneSlide {
  id?: string;
  kind: string;
  title?: string;
  lines?: string[];
  section?: string;
  reference?: string;
  imageUrl?: string;
  videoUrl?: string;
  youtubeId?: string;
}

export interface PhoneSet {
  id: string;
  title: string;
  /** "song" | "scripture" | "media" */
  type: string;
  slides: PhoneSlide[];
  /** Set by the leader in the song editor; absent = no chords configured. */
  chords?: SongChords;
}

type FontFamily = "sans" | "serif" | "mono";

export interface ViewerPrefs {
  isDark: boolean;
  fontSize: number;
  fontFamily: FontFamily;
  /** Chords are hidden by default — most people here are singing, not playing. */
  showChords: boolean;
}

const FONT_FAMILY_CSS: Record<FontFamily, string> = {
  sans: "ui-sans-serif, system-ui, sans-serif",
  serif: "Georgia, serif",
  mono: "'Space Mono', monospace",
};

// Baseline reading-text size (in rem) before the viewer's font-size slider is applied.
const BASE_FONT_REM = 1.5;

export function loadPrefs(): ViewerPrefs {
  try {
    return {
      isDark: localStorage.getItem("phyto-viewer-dark") !== "false",
      fontSize: Number(localStorage.getItem("phyto-viewer-fontsize") ?? 1),
      fontFamily: (localStorage.getItem("phyto-viewer-fontfamily") as FontFamily) ?? "sans",
      showChords: localStorage.getItem("phyto-viewer-chords") === "true",
    };
  } catch {
    return { isDark: true, fontSize: 1, fontFamily: "sans", showChords: false };
  }
}

function savePrefs(prefs: ViewerPrefs) {
  try {
    localStorage.setItem("phyto-viewer-dark", String(prefs.isDark));
    localStorage.setItem("phyto-viewer-fontsize", String(prefs.fontSize));
    localStorage.setItem("phyto-viewer-fontfamily", prefs.fontFamily);
    localStorage.setItem("phyto-viewer-chords", String(prefs.showChords));
  } catch {
    // ignore
  }
}

/**
 * A song offers the chord toggle whenever its lyrics actually carry chords —
 * independent of whether the leader left chords switched on or off in the
 * editor. That toggle only controls the editor's own box and the leader's
 * preview; a viewer here is free to look at chords the leader isn't.
 */
export function phoneSetHasChords(set: PhoneSet): boolean {
  if (set.type !== "song") return false;
  return (set.slides ?? []).some((s) => s.lines?.some((l) => parseChordLine(l).chords.length > 0));
}
const setHasChords = phoneSetHasChords;

/** Every lyric line of a set, joined — the input `guessKey` needs when a song
 *  has chords but was never given an explicit key in the editor. */
function allLines(set: PhoneSet): string {
  return (set.slides ?? []).flatMap((s) => s.lines ?? []).join("\n");
}

/** The key a set's chords are actually written in: the editor's own, or a
 *  guess from the chords themselves when the leader never set one. This is
 *  the baseline a viewer's own transpose choice moves away from. */
function setWrittenKey(set: PhoneSet): string {
  return set.chords?.key ?? guessKey(allLines(set)) ?? "C";
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export function PhoneViewer({
  sets,
  hiddenBySet = {},
  embedded = false,
  showSettings = true,
  activeId,
  onActiveChange,
  onChordChange,
  onEditSet,
  prefs: controlledPrefs,
  onPrefsChange,
}: {
  sets: PhoneSet[];
  /** Stable section keys hidden by the leader, keyed by set id. Those sections
   *  are dropped from the rendered content — the same hiding the presenter does. */
  hiddenBySet?: Record<string, string[]>;
  /** Rendered inside the presenter as a preview: fill the parent (not the whole
   *  screen) and don't touch document-level title/background. */
  embedded?: boolean;
  /** Show the hamburger settings menu. The presenter preview turns this off. */
  showSettings?: boolean;
  /** Drive the active tab from the outside (e.g. the presenter's set list).
   *  When it changes, the viewer follows. */
  activeId?: string | null;
  /** Called whenever the active set changes from inside (tab tap / swipe), so
   *  the caller can keep its own selection in sync. */
  onActiveChange?: (setId: string) => void;
  /** When provided, chord key/display changes are written back to the actual
   *  set through this callback (and persist for everyone) instead of staying a
   *  per-viewer override. The presenter preview passes this. */
  onChordChange?: (setId: string, patch: { key?: string; display?: "letters" | "numbers" }) => void;
  /** When provided, hovering the set body reveals a pencil that calls this with
   *  the active set id (the presenter preview uses it to open the editor). */
  onEditSet?: (setId: string) => void;
  /** Controlled display prefs. When provided (with onPrefsChange), an external
   *  panel drives the same prefs this view renders with (the presenter preview
   *  uses this); otherwise the view keeps its own prefs. */
  prefs?: ViewerPrefs;
  onPrefsChange?: (prefs: ViewerPrefs) => void;
}) {
  const [activeSetId, setActiveSetId] = useState<string | null>(activeId ?? sets[0]?.id ?? null);
  const [activeTabId, setActiveTabId] = useState<string | null>(activeId ?? sets[0]?.id ?? null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Prefs are internal by default, or driven from outside when controlled.
  const [internalPrefs, setInternalPrefs] = useState<ViewerPrefs>(loadPrefs);
  const prefs = controlledPrefs ?? internalPrefs;
  const setPrefs = (updater: ViewerPrefs | ((p: ViewerPrefs) => ViewerPrefs)) => {
    const next = typeof updater === "function" ? updater(prefs) : updater;
    if (onPrefsChange) onPrefsChange(next);
    else setInternalPrefs(next);
  };
  // A viewer's own transpose/letters-numbers choice, kept per set so flipping
  // between tabs and back doesn't lose it. Deliberately not persisted.
  const [chordOverrides, setChordOverrides] = useState<
    Record<string, { key: string; display: "letters" | "numbers" }>
  >({});
  const menuRef = useRef<HTMLDivElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  // Select a set from inside (tab tap / swipe), reporting back to the caller.
  const selectSet = (id: string) => {
    setActiveSetId(id);
    setActiveTabId(id);
    onActiveChange?.(id);
  };

  // Follow the externally controlled active id (e.g. the presenter's set list).
  useEffect(() => {
    if (activeId && activeId !== activeSetId && sets.some((s) => s.id === activeId)) {
      setActiveSetId(activeId);
      setActiveTabId(activeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Keep the active set valid as the set list changes (tabs added/removed).
  useEffect(() => {
    setActiveSetId((prev) => {
      const next = prev && sets.some((s) => s.id === prev) ? prev : (sets[0]?.id ?? null);
      setActiveTabId(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sets.map((s) => s.id).join("|")]);

  useEffect(() => {
    if (!tabBarRef.current) return;
    const idx = sets.findIndex((s) => s.id === activeTabId);
    if (idx < 0) return;
    const buttons = tabBarRef.current.querySelectorAll("button");
    const activeButton = buttons[idx] as HTMLElement | undefined;
    if (activeButton) {
      const buttonRect = activeButton.getBoundingClientRect();
      const containerRect = tabBarRef.current.getBoundingClientRect();
      const relativeLeft = buttonRect.left - containerRect.left + tabBarRef.current.scrollLeft;
      tabBarRef.current.scrollTo({ left: Math.max(0, relativeLeft - 16), behavior: "smooth" });
    }
  }, [activeTabId, sets]);

  // Only the standalone viewer paints the document background; the embedded
  // preview must leave the presenter's own page chrome alone.
  useEffect(() => {
    if (embedded) return;
    const bg = prefs.isDark ? "#000000" : "#ffffff";
    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;
    return () => {
      document.documentElement.style.backgroundColor = "";
      document.body.style.backgroundColor = "";
    };
  }, [prefs.isDark, embedded]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const activeIdx = sets.findIndex((s) => s.id === activeSetId);
  const activeSet = sets[activeIdx] ?? sets[0] ?? null;

  // When chord changes write back to the set (presenter preview), the set is the
  // single source of truth — ignore the per-viewer overrides so the controls
  // always show what the set actually stores.
  const persistChords = !!onChordChange;

  // The active song's chord view: its own written key/display unless this
  // viewer has transposed or switched it themselves this session.
  const activeChordConfig = (() => {
    if (!activeSet || !setHasChords(activeSet)) return null;
    const writtenKey = setWrittenKey(activeSet);
    const override = persistChords ? undefined : chordOverrides[activeSet.id];
    return {
      writtenKey,
      key: override?.key ?? writtenKey,
      display: override?.display ?? activeSet.chords?.display ?? "letters",
    };
  })();

  // The embedded preview has no hamburger, so chords can't be toggled there —
  // show them whenever the active set actually has any, so the leader can see
  // and change the key. Otherwise honour the viewer's own Show/Hide choice.
  const showChords = showSettings ? prefs.showChords : !!activeSet && setHasChords(activeSet);

  const setActiveChordOverride = (
    patch: Partial<{ key: string; display: "letters" | "numbers" }>,
  ) => {
    if (!activeSet || !activeChordConfig) return;
    if (persistChords) {
      onChordChange!(activeSet.id, patch);
      return;
    }
    setChordOverrides((prev) => ({
      ...prev,
      [activeSet.id]: { key: activeChordConfig.key, display: activeChordConfig.display, ...patch },
    }));
  };

  const themeClasses = prefs.isDark ? "bg-black text-white" : "bg-white text-black";
  const borderClass = prefs.isDark ? "border-white/10" : "border-black/10";
  const mutedClass = prefs.isDark ? "text-white/40" : "text-black/40";

  return (
    <div
      className={`flex flex-col ${embedded ? "h-full" : "min-h-screen"} ${themeClasses}`}
      style={{
        fontFamily: FONT_FAMILY_CSS[prefs.fontFamily],
        fontSize: `${prefs.fontSize * BASE_FONT_REM}rem`,
      }}
    >
      {/* Tab bar */}
      <div className={`relative flex shrink-0 items-stretch border-b ${borderClass}`}>
        {/* Hamburger — hidden in the presenter preview. */}
        {showSettings && (
          <div ref={menuRef} className="relative shrink-0">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className={`flex h-full items-center px-4 ${mutedClass} hover:text-inherit`}
              aria-label="Settings"
            >
              <span className="flex flex-col gap-[5px]">
                <span className={`block h-[2px] w-5 ${prefs.isDark ? "bg-white" : "bg-black"}`} />
                <span className={`block h-[2px] w-5 ${prefs.isDark ? "bg-white" : "bg-black"}`} />
                <span className={`block h-[2px] w-5 ${prefs.isDark ? "bg-white" : "bg-black"}`} />
              </span>
            </button>

            {/* Settings overlay */}
            {menuOpen && (
              <div
                className={`absolute left-0 top-full z-50 mt-1 w-[240px] rounded-2xl border p-4 shadow-xl ${
                  prefs.isDark
                    ? "dark border-white/10 bg-neutral-900 text-white"
                    : "border-black/10 bg-white text-black"
                }`}
                style={{ fontFamily: "'Space Mono', monospace", fontSize: "1rem" }}
              >
                <ViewerSettings
                  prefs={prefs}
                  setPrefs={setPrefs}
                  hasChords={sets.some((s) => setHasChords(s))}
                />
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div
          ref={tabBarRef}
          className={`phone-tab-scroll flex overflow-x-auto ${prefs.isDark ? "" : "phone-tab-scroll-light"}`}
        >
          {sets.map((s) => (
            <button
              key={s.id}
              onClick={() => selectSet(s.id)}
              className={`shrink-0 whitespace-nowrap px-4 py-3 text-sm transition-colors ${
                s.id === activeTabId
                  ? prefs.isDark
                    ? "border-b-2 border-white text-white"
                    : "border-b-2 border-black text-black"
                  : mutedClass
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>
      </div>

      {/* Chord controls — transpose and letters/numbers. */}
      {showChords && activeChordConfig && (
        <div
          className={`flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2 ${borderClass}`}
        >
          <div className="flex items-center gap-2">
            {(["numbers", "letters"] as const).map((d) => {
              const active = activeChordConfig.display === d;
              return (
                <button
                  key={d}
                  onClick={() => setActiveChordOverride({ display: d })}
                  style={{ fontFamily: "'Space Mono', monospace" }}
                  className={`pill h-7 border px-3 text-xs uppercase tracking-wider transition ${
                    active
                      ? prefs.isDark
                        ? "border-white bg-white text-black"
                        : "border-black bg-black text-white"
                      : prefs.isDark
                        ? "border-white text-white hover:bg-white/10"
                        : "border-black text-black hover:bg-black/10"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>

          {/* Key only means anything for letters — numbers are key-agnostic. */}
          {activeChordConfig.display === "letters" && (
            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] uppercase tracking-wider ${mutedClass}`}
                style={{ fontFamily: "'Space Mono', monospace" }}
              >
                Key
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    style={{ fontFamily: "'Space Mono', monospace" }}
                    className={`pill flex h-7 items-center gap-1.5 border pl-3 pr-2.5 text-xs tracking-wider transition ${
                      prefs.isDark
                        ? "border-white text-white hover:bg-white/10"
                        : "border-black text-black hover:bg-black/10"
                    }`}
                  >
                    {activeChordConfig.key}
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className={`min-w-0 ${
                    prefs.isDark
                      ? "border-white/20 bg-black text-white"
                      : "border-black/20 bg-white text-black"
                  }`}
                >
                  {KEYS.map((k) => (
                    <DropdownMenuItem
                      key={k}
                      onClick={() => setActiveChordOverride({ key: k })}
                      style={{ fontFamily: "'Space Mono', monospace" }}
                      className={`text-xs tracking-wider ${
                        prefs.isDark
                          ? "focus:bg-white/10 focus:text-white"
                          : "focus:bg-black/10 focus:text-black"
                      }`}
                    >
                      {k}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      )}

      {/* Set content */}
      <div className="group relative min-h-0 flex-1">
        {onEditSet && activeSet && (
          <button
            onClick={() => onEditSet(activeSet.id)}
            className={`pill absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center border opacity-0 shadow-lg transition group-hover:opacity-100 ${
              prefs.isDark
                ? "border-white/30 bg-black text-white hover:bg-white hover:text-black"
                : "border-black/20 bg-white text-black hover:bg-black hover:text-white"
            }`}
            title="Edit this set"
            aria-label="Edit this set"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
        <div
          className="h-full overflow-y-auto"
          onTouchStart={(e) => {
            if (e.touches.length > 1) {
              touchStartX.current = null;
              return;
            }
            touchStartX.current = e.touches[0].clientX;
          }}
          onTouchMove={(e) => {
            if (e.touches.length > 1) touchStartX.current = null;
          }}
          onTouchEnd={(e) => {
            if (touchStartX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            touchStartX.current = null;
            if (Math.abs(dx) < 50) return;
            if (dx < 0 && activeIdx < sets.length - 1) {
              selectSet(sets[activeIdx + 1].id);
            } else if (dx > 0 && activeIdx > 0) {
              selectSet(sets[activeIdx - 1].id);
            }
          }}
        >
          {activeSet && (
            <SetContent
              set={activeSet}
              hiddenKeys={hiddenBySet[activeSet.id] ?? []}
              isDark={prefs.isDark}
              showChords={showChords}
              chordConfig={activeChordConfig}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** The display controls (font size / type / theme / chords) shown both in the
 *  phone's hamburger menu and — for the presenter — as a panel beside the phone
 *  preview. Styled to the phone theme it's editing (prefs.isDark). */
export function ViewerSettings({
  prefs,
  setPrefs,
  hasChords,
}: {
  prefs: ViewerPrefs;
  setPrefs: (updater: (p: ViewerPrefs) => ViewerPrefs) => void;
  hasChords: boolean;
}) {
  const mutedClass = prefs.isDark ? "text-white/40" : "text-black/40";
  return (
    <div
      className="space-y-4 text-sm"
      style={{ fontFamily: "'Space Mono', monospace", fontSize: "1rem" }}
    >
      {/* Font size */}
      <div>
        <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider">
          <span>Font size</span>
          <span className={mutedClass}>{prefs.fontSize.toFixed(2)}×</span>
        </div>
        <input
          type="range"
          min={0.85}
          max={1.8}
          step={0.05}
          value={prefs.fontSize}
          onChange={(e) => setPrefs((p) => ({ ...p, fontSize: Number(e.target.value) }))}
          className="w-full"
        />
      </div>

      {/* Font type */}
      <div>
        <div className="mb-2 text-[10px] uppercase tracking-wider">Font type</div>
        <div className="grid grid-cols-1 gap-1">
          {(["sans", "serif", "mono"] as FontFamily[]).map((f) => {
            const active = prefs.fontFamily === f;
            return (
              <button
                key={f}
                onClick={() => setPrefs((p) => ({ ...p, fontFamily: f }))}
                style={{ fontFamily: FONT_FAMILY_CSS[f] }}
                className={`rounded-lg border px-3 py-1.5 text-left text-sm capitalize transition ${
                  active
                    ? prefs.isDark
                      ? "border-white bg-white text-black"
                      : "border-black bg-black text-white"
                    : prefs.isDark
                      ? "border-white/20 hover:border-white"
                      : "border-black/20 hover:border-black"
                }`}
              >
                {f}
              </button>
            );
          })}
        </div>
      </div>

      {/* Theme */}
      <div>
        <div className="mb-2 text-[10px] uppercase tracking-wider">Theme</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setPrefs((p) => ({ ...p, isDark: true }))}
            style={{ fontFamily: "Arial, sans-serif" }}
            className={`rounded-lg border px-3 py-2 text-xs transition bg-black text-white ${
              prefs.isDark ? "border-black" : "border-black/20 hover:border-black"
            }`}
          >
            Dark
          </button>
          <button
            onClick={() => setPrefs((p) => ({ ...p, isDark: false }))}
            style={{ fontFamily: "Arial, sans-serif" }}
            className={`rounded-lg border px-3 py-2 text-xs transition bg-white text-black ${
              !prefs.isDark ? "border-black" : "border-black/20 hover:border-black"
            }`}
          >
            Light
          </button>
        </div>
      </div>

      {/* Chords — a toggle, only when a set actually has any. */}
      {hasChords && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider">Chords</span>
          <Switch
            checked={prefs.showChords}
            onCheckedChange={(on) => setPrefs((p) => ({ ...p, showChords: on }))}
            aria-label="Show chords"
          />
        </div>
      )}
    </div>
  );
}

/** A viewer's current chord view for the active song — always derived from
 *  the set, never written back to it. `null` when the song has no chords. */
type ChordViewConfig = { writtenKey: string; key: string; display: "letters" | "numbers" };

function SetContent({
  set,
  hiddenKeys,
  isDark,
  showChords,
  chordConfig,
}: {
  set: PhoneSet;
  hiddenKeys: string[];
  isDark: boolean;
  showChords: boolean;
  chordConfig: ChordViewConfig | null;
}) {
  // Drop the sections the leader hid before anything is grouped or rendered —
  // the phone mirrors the presenter's visibility exactly.
  const hidden = hiddenSlideIndices(set.slides ?? [], hiddenKeys);
  const slides = (set.slides ?? []).filter((_, i) => !hidden.has(i));

  if (set.type === "scripture") {
    // Group slides by section, preserving order
    const groups: { section: string | undefined; lines: string[] }[] = [];
    for (const slide of slides) {
      const last = groups[groups.length - 1];
      if (last && last.section === slide.section) {
        last.lines.push(...(slide.lines ?? []));
      } else {
        groups.push({ section: slide.section, lines: [...(slide.lines ?? [])] });
      }
    }

    return (
      <div className="space-y-6 px-4 py-6">
        {groups.map((group, i) => (
          <div key={i} className="space-y-1">
            {group.section && (
              <p
                className={`text-xs uppercase tracking-widest ${isDark ? "opacity-40" : "opacity-50"}`}
              >
                {group.section}
              </p>
            )}
            <p className="leading-relaxed">{group.lines.join(" ")}</p>
          </div>
        ))}
      </div>
    );
  }

  if (set.type === "song") {
    // Group consecutive slides that share a section into one flowing block.
    const groups: { section: string | undefined; lines: string[] }[] = [];
    for (const slide of slides) {
      const last = groups[groups.length - 1];
      if (last && last.section === slide.section) {
        last.lines.push(...(slide.lines ?? []));
      } else {
        groups.push({ section: slide.section, lines: [...(slide.lines ?? [])] });
      }
    }
    return (
      <div className="space-y-6 px-4 py-6">
        {groups.map((group, i) => (
          <SlideBlock
            key={i}
            section={group.section}
            lines={group.lines}
            isDark={isDark}
            chordConfig={chordConfig}
            showChords={showChords}
          />
        ))}
      </div>
    );
  }

  if (set.type === "media") {
    const mediaSlides = slides.filter((s) => s.imageUrl || s.youtubeId || s.videoUrl);
    return (
      <div className="space-y-4 px-4 py-6">
        {mediaSlides.map((slide, i) => (
          <MediaSlide key={slide.id ?? i} slide={slide} />
        ))}
      </div>
    );
  }

  return null;
}

function MediaSlide({ slide }: { slide: PhoneSlide }) {
  // YouTube → privacy-friendly nocookie embed.
  if (slide.youtubeId) {
    return (
      <div className="aspect-video w-full">
        <iframe
          className="h-full w-full border-0"
          src={`https://www.youtube-nocookie.com/embed/${slide.youtubeId}?rel=0&modestbranding=1&playsinline=1`}
          title={slide.title ?? "Video"}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  // Uploaded file / direct URL → native <video>.
  if (slide.videoUrl) {
    return (
      <video
        className="w-full bg-black"
        src={slide.videoUrl}
        controls
        playsInline
        preload="metadata"
      />
    );
  }

  if (slide.imageUrl) {
    return <img src={slide.imageUrl} alt="" className="w-full" />;
  }

  return null;
}

function SlideBlock({
  section,
  lines,
  isDark,
  chordConfig,
  showChords,
}: {
  section: string | undefined;
  lines: string[];
  isDark: boolean;
  chordConfig: ChordViewConfig | null;
  showChords: boolean;
}) {
  const mutedClass = isDark ? "opacity-40" : "opacity-50";
  const chords: SongChords | undefined = chordConfig
    ? { key: chordConfig.key, display: chordConfig.display }
    : undefined;
  return (
    <div className={showChords ? "space-y-2" : "space-y-1"}>
      {section && <p className={`text-xs uppercase tracking-widest ${mutedClass}`}>{section}</p>}
      {lines.map((line, j) => (
        <ChordLine
          key={j}
          line={
            chordConfig && chordConfig.writtenKey !== chordConfig.key
              ? transposeLyrics(line, chordConfig.writtenKey, chordConfig.key)
              : line
          }
          chords={chords}
          show={showChords}
          className="leading-relaxed"
          chordClassName="text-[0.7em] font-semibold"
          chordStyle={{ fontFamily: "'Space Mono', monospace" }}
        />
      ))}
    </div>
  );
}
