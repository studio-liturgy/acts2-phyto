import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isLiveNow } from "@/lib/live-session";
import { ChordLine } from "@/components/ChordLine";
import { guessKey, KEYS, parseChordLine, transposeLyrics, type SongChords } from "@/lib/chords";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

// Per-gathering share view — private, ephemeral links. Keep out of search.

// ---------------------------------------------------------------------------
// Types — raw Supabase rows, kept local to avoid coupling with the auth'd app
// ---------------------------------------------------------------------------

interface GatheringRow {
  id: string;
  title: string;
  share_token: string;
  is_live: boolean;
  /** Epoch ms, or null. Paired with `is_live` to give the 24h auto-expiry. */
  live_started_at: number | null;
}

interface GatheringSetRow {
  set_id: string;
  position: number;
}

interface SlideRow {
  id?: string;
  kind: string;
  title?: string;
  lines?: string[];
  section?: string;
  reference?: string;
  imageUrl?: string;
  videoSource?: "youtube" | "file" | "url";
  videoUrl?: string;
  youtubeId?: string;
}

interface SetRow {
  id: string;
  title: string;
  type: string;
  /** `chords` is set by the leader in the song editor. Absent = this song has
   *  no chords configured, so the chord toggle stays hidden for it. */
  content: { slides: SlideRow[]; chords?: SongChords };
}

interface ViewerSet {
  position: number;
  set: SetRow;
}

type Status = "loading" | "not-found" | "not-live" | "live" | "ended";

type FontFamily = "sans" | "serif" | "mono";

interface ViewerPrefs {
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

function loadPrefs(): ViewerPrefs {
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

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/g/$token")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: GatheringViewer,
});

// ---------------------------------------------------------------------------
// Supabase fetchers — no auth required
// ---------------------------------------------------------------------------

async function fetchGathering(token: string): Promise<GatheringRow | null> {
  const { data } = await supabase
    .from("gatherings")
    .select("id, title, share_token, is_live, live_started_at")
    .eq("share_token", token)
    .maybeSingle();
  if (!data) return null;
  return {
    ...(data as Omit<GatheringRow, "live_started_at">),
    live_started_at: data.live_started_at ? new Date(data.live_started_at).getTime() : null,
  };
}

async function fetchViewerSets(gatheringId: string): Promise<ViewerSet[]> {
  const { data: gsRows } = await supabase
    .from("gathering_sets")
    .select("set_id, position")
    .eq("gathering_id", gatheringId)
    .order("position");

  if (!gsRows?.length) return [];

  const setIds = (gsRows as GatheringSetRow[]).map((r) => r.set_id);
  const { data: setRows } = await supabase
    .from("sets")
    .select("id, title, type, content")
    .in("id", setIds);

  if (!setRows?.length) return [];

  const setMap = new Map((setRows as SetRow[]).map((s) => [s.id, s]));
  return (gsRows as GatheringSetRow[])
    .map((gs) => {
      const set = setMap.get(gs.set_id);
      return set ? { position: gs.position, set } : null;
    })
    .filter((x): x is ViewerSet => x !== null);
}

/**
 * A song offers the chord toggle whenever its lyrics actually carry chords —
 * independent of whether the leader left chords switched on or off in the
 * editor. That toggle only controls the editor's own box and the leader's
 * preview; a viewer here is free to look at chords the leader isn't.
 */
function setHasChords(set: SetRow): boolean {
  if (set.type !== "song") return false;
  return (set.content.slides ?? []).some((s) =>
    s.lines?.some((l) => parseChordLine(l).chords.length > 0),
  );
}

/** Every lyric line of a set, joined — the input `guessKey` needs when a song
 *  has chords but was never given an explicit key in the editor. */
function allLines(set: SetRow): string {
  return (set.content?.slides ?? []).flatMap((s) => s.lines ?? []).join("\n");
}

/** The key a set's chords are actually written in: the editor's own, or a
 *  guess from the chords themselves when the leader never set one. This is
 *  the baseline a viewer's own transpose choice moves away from. */
function setWrittenKey(set: SetRow): string {
  return set.content?.chords?.key ?? guessKey(allLines(set)) ?? "C";
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

function GatheringViewer() {
  const { token } = Route.useParams();
  const [status, setStatus] = useState<Status>("loading");
  const [gatheringName, setGatheringName] = useState<string | null>(null);
  const [sets, setSets] = useState<ViewerSet[]>([]);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [prefs, setPrefs] = useState<ViewerPrefs>(loadPrefs);
  // A viewer's own transpose/letters-numbers choice, kept per set so flipping
  // between tabs and back doesn't lose it. Deliberately not persisted to
  // localStorage or written back to the set — it's ordinary React state, gone
  // the moment the page reloads, and it never changes what the leader or
  // anyone else sees.
  const [chordOverrides, setChordOverrides] = useState<
    Record<string, { key: string; display: "letters" | "numbers" }>
  >({});
  const menuRef = useRef<HTMLDivElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const prevLiveRef = useRef<boolean | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  useEffect(() => {
    document.title = gatheringName || "Gathering";
  }, [gatheringName]);

  useEffect(() => {
    if (!tabBarRef.current) return;
    const idx = sets.findIndex((vs) => vs.set.id === activeTabId);
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

  useEffect(() => {
    const bg = prefs.isDark ? "#000000" : "#ffffff";
    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;
    return () => {
      document.documentElement.style.backgroundColor = "";
      document.body.style.backgroundColor = "";
    };
  }, [prefs.isDark]);

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

  useEffect(() => {
    stoppedRef.current = false;
    prevLiveRef.current = null;

    const poll = async () => {
      if (stoppedRef.current) return;

      const g = await fetchGathering(token);
      if (stoppedRef.current) return;

      if (!g) {
        setStatus("not-found");
        stoppedRef.current = true;
        return;
      }

      setGatheringName(g.title);

      // A session auto-ends 24h after it started, so an abandoned gathering
      // stops being live even though the presenter never flipped the flag.
      // Checking here is what stops this poll loop: otherwise a tab left open
      // on the share link re-fetches every set's full content, forever.
      const live = isLiveNow(g);
      const wasLive = prevLiveRef.current;
      prevLiveRef.current = live;

      // Gathering ended — was live, now not. A gathering still flagged live but
      // past its window is treated the same way on first poll, so opening a
      // stale link lands on "ended" instead of polling indefinitely.
      if (!live && (wasLive === true || g.is_live)) {
        setStatus("ended");
        stoppedRef.current = true;
        return;
      }

      if (live) {
        const viewerSets = await fetchViewerSets(g.id);
        if (stoppedRef.current) return;
        setSets(viewerSets);
        setStatus("live");
        setActiveSetId((prev) => {
          const next =
            prev === null
              ? (viewerSets[0]?.set.id ?? null)
              : viewerSets.some((vs) => vs.set.id === prev)
                ? prev
                : (viewerSets[0]?.set.id ?? null);
          setActiveTabId(next);
          return next;
        });
      } else {
        setStatus("not-live");
      }
    };

    poll();
    const timer = setInterval(poll, 8000);
    return () => {
      stoppedRef.current = true;
      clearInterval(timer);
    };
  }, [token]);

  const activeIdx = sets.findIndex((vs) => vs.set.id === activeSetId);
  const activeSet = sets[activeIdx]?.set ?? sets[0]?.set ?? null;

  // The active song's chord view: its own written key/display unless this
  // viewer has transposed or switched it themselves this session. `writtenKey`
  // is always the set's own — never overridden — so a line can be transposed
  // from it to whatever `key` this viewer chose.
  const activeChordConfig = (() => {
    if (!activeSet || !setHasChords(activeSet)) return null;
    const writtenKey = setWrittenKey(activeSet);
    const override = chordOverrides[activeSet.id];
    return {
      writtenKey,
      key: override?.key ?? writtenKey,
      display: override?.display ?? activeSet.content?.chords?.display ?? "letters",
    };
  })();

  const setActiveChordOverride = (
    patch: Partial<{ key: string; display: "letters" | "numbers" }>,
  ) => {
    if (!activeSet || !activeChordConfig) return;
    setChordOverrides((prev) => ({
      ...prev,
      [activeSet.id]: { key: activeChordConfig.key, display: activeChordConfig.display, ...patch },
    }));
  };

  const themeClasses = prefs.isDark ? "bg-black text-white" : "bg-white text-black";
  const borderClass = prefs.isDark ? "border-white/10" : "border-black/10";
  const mutedClass = prefs.isDark ? "text-white/40" : "text-black/40";

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-sm opacity-50">Loading…</p>
      </div>
    );
  }

  if (status === "not-found") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <p>Gathering not found.</p>
      </div>
    );
  }

  if (status === "not-live") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <p>This gathering hasn't started yet!</p>
      </div>
    );
  }

  if (status === "ended") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <p>This gathering has ended.</p>
      </div>
    );
  }

  // Live
  return (
    <div
      className={`flex min-h-screen flex-col ${themeClasses}`}
      style={{
        fontFamily: FONT_FAMILY_CSS[prefs.fontFamily],
        fontSize: `${prefs.fontSize * BASE_FONT_REM}rem`,
      }}
    >
      {/* Tab bar */}
      <div className={`relative flex shrink-0 items-stretch border-b ${borderClass}`}>
        {/* Hamburger */}
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
              {/* Header. No close button: tapping outside already dismisses. */}
              <div className="mb-3 text-[10px] uppercase tracking-wider">Display</div>

              <div className="space-y-4 text-sm">
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

                {/* Chords — only for gatherings that actually have any */}
                {sets.some((vs) => setHasChords(vs.set)) && (
                  <div>
                    <div className="mb-2 text-[10px] uppercase tracking-wider">Chords</div>
                    <div className="grid grid-cols-2 gap-2">
                      {([false, true] as const).map((on) => {
                        const active = prefs.showChords === on;
                        return (
                          <button
                            key={String(on)}
                            onClick={() => setPrefs((p) => ({ ...p, showChords: on }))}
                            style={{ fontFamily: "Arial, sans-serif" }}
                            className={`rounded-lg border px-3 py-2 text-xs transition ${
                              active
                                ? prefs.isDark
                                  ? "border-white bg-white text-black"
                                  : "border-black bg-black text-white"
                                : prefs.isDark
                                  ? "border-white/20 hover:border-white"
                                  : "border-black/20 hover:border-black"
                            }`}
                          >
                            {on ? "Show" : "Hide"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div ref={tabBarRef} className="flex overflow-x-auto">
          {sets.map((vs) => (
            <button
              key={vs.set.id}
              onClick={() => {
                setActiveSetId(vs.set.id);
                setActiveTabId(vs.set.id);
              }}
              className={`shrink-0 whitespace-nowrap px-4 py-3 text-sm transition-colors ${
                vs.set.id === activeTabId
                  ? prefs.isDark
                    ? "border-b-2 border-white text-white"
                    : "border-b-2 border-black text-black"
                  : mutedClass
              }`}
            >
              {vs.set.title}
            </button>
          ))}
        </div>
      </div>

      {/* Chord controls — transpose and letters/numbers, for this viewer only.
          Shown right under the tabs, only while chords are on and the active
          song actually has any. Never touches the set: a fresh visit always
          starts back at the song's own written key. */}
      {prefs.showChords && activeChordConfig && (
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

          {/* Key only means anything for letters — numbers are key-agnostic,
              same as the set editor hiding this control in that mode. */}
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
      <div
        className="flex-1 overflow-y-auto"
        onTouchStart={(e) => {
          // Ignore multi-touch (pinch-to-zoom) — don't start a swipe.
          if (e.touches.length > 1) {
            touchStartX.current = null;
            return;
          }
          touchStartX.current = e.touches[0].clientX;
        }}
        onTouchMove={(e) => {
          // A second finger landed mid-gesture (pinch) — cancel the swipe.
          if (e.touches.length > 1) touchStartX.current = null;
        }}
        onTouchEnd={(e) => {
          if (touchStartX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchStartX.current;
          touchStartX.current = null;
          if (Math.abs(dx) < 50) return;
          if (dx < 0 && activeIdx < sets.length - 1) {
            const nextId = sets[activeIdx + 1].set.id;
            setActiveTabId(nextId);
            setActiveSetId(nextId);
          } else if (dx > 0 && activeIdx > 0) {
            const prevId = sets[activeIdx - 1].set.id;
            setActiveTabId(prevId);
            setActiveSetId(prevId);
          }
        }}
      >
        {activeSet && (
          <SetContent
            set={activeSet}
            isDark={prefs.isDark}
            showChords={prefs.showChords}
            chordConfig={activeChordConfig}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A viewer's current chord view for the active song — always derived from
 *  the set, never written back to it. `null` when the song has no chords. */
type ChordViewConfig = { writtenKey: string; key: string; display: "letters" | "numbers" };

function SetContent({
  set,
  isDark,
  showChords,
  chordConfig,
}: {
  set: SetRow;
  isDark: boolean;
  showChords: boolean;
  chordConfig: ChordViewConfig | null;
}) {
  const slides = set.content?.slides ?? [];

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
    // Group consecutive slides that share a section into one flowing block —
    // a slide break within a verse (e.g. from linesPer) is a display-only
    // split, not a real stanza boundary, so it shouldn't get the same visual
    // gap as an actual section change.
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

function MediaSlide({ slide }: { slide: SlideRow }) {
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
  // renderChord only ever converts letters<->numbers of whatever key a chord
  // is already written in — it doesn't move the chord to a different key.
  // Getting from the set's own written key to this viewer's chosen one is a
  // real transpose, done here before the line ever reaches ChordLine.
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
          // 0.7em so chords track the viewer's own font-size slider. Colour is
          // inherited rather than set: white on the dark theme, black on light.
          // Space Mono has to be inline — the viewer's font picker sets a
          // font-family on an ancestor that a class would lose to.
          chordClassName="text-[0.7em] font-semibold"
          chordStyle={{ fontFamily: "'Space Mono', monospace" }}
        />
      ))}
    </div>
  );
}
