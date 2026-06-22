import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types — raw Supabase rows, kept local to avoid coupling with the auth'd app
// ---------------------------------------------------------------------------

interface GatheringRow {
  id: string;
  title: string;
  share_token: string;
  is_live: boolean;
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
}

interface SetRow {
  id: string;
  title: string;
  type: string;
  content: { slides: SlideRow[] };
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
      fontFamily:
        (localStorage.getItem("phyto-viewer-fontfamily") as FontFamily) ??
        "sans",
    };
  } catch {
    return { isDark: true, fontSize: 1, fontFamily: "sans" };
  }
}

function savePrefs(prefs: ViewerPrefs) {
  try {
    localStorage.setItem("phyto-viewer-dark", String(prefs.isDark));
    localStorage.setItem("phyto-viewer-fontsize", String(prefs.fontSize));
    localStorage.setItem("phyto-viewer-fontfamily", prefs.fontFamily);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/g/$token")({
  component: GatheringViewer,
});

// ---------------------------------------------------------------------------
// Supabase fetchers — no auth required
// ---------------------------------------------------------------------------

async function fetchGathering(token: string): Promise<GatheringRow | null> {
  const { data } = await supabase
    .from("gatherings")
    .select("id, title, share_token, is_live")
    .eq("share_token", token)
    .maybeSingle();
  return data ?? null;
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
    const buttons = tabBarRef.current.querySelectorAll('button');
    const activeButton = buttons[idx] as HTMLElement | undefined;
    if (activeButton) {
      const buttonRect = activeButton.getBoundingClientRect();
      const containerRect = tabBarRef.current.getBoundingClientRect();
      const relativeLeft = buttonRect.left - containerRect.left + tabBarRef.current.scrollLeft;
      tabBarRef.current.scrollTo({ left: Math.max(0, relativeLeft - 16), behavior: 'smooth' });
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

      const wasLive = prevLiveRef.current;
      prevLiveRef.current = g.is_live;

      // Gathering ended — was live, now not
      if (!g.is_live && wasLive === true) {
        setStatus("ended");
        stoppedRef.current = true;
        return;
      }

      if (g.is_live) {
        const viewerSets = await fetchViewerSets(g.id);
        if (stoppedRef.current) return;
        setSets(viewerSets);
        setStatus("live");
        setActiveSetId((prev) => {
          const next = prev === null ? (viewerSets[0]?.set.id ?? null)
            : viewerSets.some((vs) => vs.set.id === prev) ? prev
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

  const themeClasses = prefs.isDark
    ? "bg-black text-white"
    : "bg-white text-black";
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
      <div
        className={`relative flex shrink-0 items-stretch border-b ${borderClass}`}
      >
        {/* Hamburger */}
        <div ref={menuRef} className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className={`flex h-full items-center px-4 ${mutedClass} hover:text-inherit`}
            aria-label="Settings"
          >
            <span className="flex flex-col gap-[5px]">
              <span
                className={`block h-[2px] w-5 ${prefs.isDark ? "bg-white" : "bg-black"}`}
              />
              <span
                className={`block h-[2px] w-5 ${prefs.isDark ? "bg-white" : "bg-black"}`}
              />
              <span
                className={`block h-[2px] w-5 ${prefs.isDark ? "bg-white" : "bg-black"}`}
              />
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
              {/* Header */}
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-wider">
                  Display
                </div>
                <button
                  onClick={() => setMenuOpen(false)}
                  style={{ fontFamily: "Arial, sans-serif" }}
                  className={`text-xs transition-colors ${mutedClass} hover:text-inherit`}
                >
                  Cancel
                </button>
              </div>

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
                    onChange={(e) =>
                      setPrefs((p) => ({ ...p, fontSize: Number(e.target.value) }))
                    }
                    className="w-full"
                  />
                </div>

                {/* Font type */}
                <div>
                  <div className="mb-2 text-[10px] uppercase tracking-wider">
                    Font type
                  </div>
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
                  <div className="mb-2 text-[10px] uppercase tracking-wider">
                    Theme
                  </div>
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
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div ref={tabBarRef} className="flex overflow-x-auto">
          {sets.map((vs) => (
            <button
              key={vs.set.id}
              onClick={() => { setActiveSetId(vs.set.id); setActiveTabId(vs.set.id); }}
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

      {/* Set content */}
      <div
        className="flex-1 overflow-y-auto"
        onTouchStart={(e) => {
          // Ignore multi-touch (pinch-to-zoom) — don't start a swipe.
          if (e.touches.length > 1) { touchStartX.current = null; return; }
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
        {activeSet && <SetContent set={activeSet} isDark={prefs.isDark} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SetContent({ set, isDark }: { set: SetRow; isDark: boolean }) {
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
    return (
      <div className="space-y-6 px-4 py-6">
        {slides.map((slide, i) => (
          <SlideBlock
            key={slide.id ?? i}
            slide={slide}
            isDark={isDark}
            showSection={slide.section !== slides[i - 1]?.section}
          />
        ))}
      </div>
    );
  }

  if (set.type === "media") {
    const imageSlides = slides.filter((s) => s.imageUrl);
    return (
      <div className="space-y-4 px-4 py-6">
        {imageSlides.map((slide, i) => (
          <img
            key={slide.id ?? i}
            src={slide.imageUrl}
            alt=""
            className="w-full"
          />
        ))}
      </div>
    );
  }

  return null;
}

function SlideBlock({
  slide,
  isDark,
  showSection = true,
}: {
  slide: SlideRow;
  isDark: boolean;
  showSection?: boolean;
}) {
  const mutedClass = isDark ? "opacity-40" : "opacity-50";
  return (
    <div className="space-y-1">
      {showSection && slide.section && (
        <p className={`text-xs uppercase tracking-widest ${mutedClass}`}>
          {slide.section}
        </p>
      )}
      {slide.title && <p className="font-semibold">{slide.title}</p>}
      {slide.lines?.map((line, j) => (
        <p key={j} className="leading-relaxed">
          {line || " "}
        </p>
      ))}
    </div>
  );
}
