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

const FONT_SIZES = [0.85, 1, 1.2, 1.5, 1.8];
const FONT_SIZE_LABELS = ["A", "A", "A", "A", "A"];

const FONT_FAMILY_CSS: Record<FontFamily, string> = {
  sans: "ui-sans-serif, system-ui, sans-serif",
  serif: "Georgia, serif",
  mono: "'Space Mono', monospace",
};

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
  const [sets, setSets] = useState<ViewerSet[]>([]);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [prefs, setPrefs] = useState<ViewerPrefs>(loadPrefs);
  const menuRef = useRef<HTMLDivElement>(null);
  const prevLiveRef = useRef<boolean | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

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
          if (prev === null) return viewerSets[0]?.set.id ?? null;
          if (viewerSets.some((vs) => vs.set.id === prev)) return prev;
          return viewerSets[0]?.set.id ?? null;
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

  const activeSet =
    sets.find((vs) => vs.set.id === activeSetId)?.set ?? sets[0]?.set ?? null;

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
        <p>Gathering not found</p>
      </div>
    );
  }

  if (status === "not-live") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <p>This gathering hasn't started yet</p>
      </div>
    );
  }

  if (status === "ended") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <p>This gathering has ended</p>
      </div>
    );
  }

  const fontSizeIdx = FONT_SIZES.indexOf(prefs.fontSize);

  // Live
  return (
    <div
      className={`flex min-h-screen flex-col ${themeClasses}`}
      style={{
        fontFamily: FONT_FAMILY_CSS[prefs.fontFamily],
        fontSize: `${prefs.fontSize}rem`,
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
              className={`absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-lg p-4 shadow-xl ${
                prefs.isDark
                  ? "bg-neutral-900 text-white ring-1 ring-white/10"
                  : "bg-white text-black ring-1 ring-black/10"
              }`}
            >
              {/* Text size */}
              <div className="mb-4">
                <p
                  className={`mb-2 text-xs uppercase tracking-widest ${mutedClass}`}
                >
                  Text size
                </p>
                <div className="flex gap-1">
                  {FONT_SIZES.map((size, i) => (
                    <button
                      key={size}
                      onClick={() =>
                        setPrefs((p) => ({ ...p, fontSize: size }))
                      }
                      className={`flex-1 rounded py-1 text-center transition-colors ${
                        prefs.fontSize === size
                          ? prefs.isDark
                            ? "bg-white text-black"
                            : "bg-black text-white"
                          : prefs.isDark
                            ? "hover:bg-white/10"
                            : "hover:bg-black/10"
                      }`}
                      style={{ fontSize: `${0.6 + i * 0.1}rem` }}
                    >
                      {FONT_SIZE_LABELS[i]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font family */}
              <div className="mb-4">
                <p
                  className={`mb-2 text-xs uppercase tracking-widest ${mutedClass}`}
                >
                  Font
                </p>
                <div className="flex gap-1">
                  {(["sans", "serif", "mono"] as FontFamily[]).map((f) => (
                    <button
                      key={f}
                      onClick={() =>
                        setPrefs((p) => ({ ...p, fontFamily: f }))
                      }
                      className={`flex-1 rounded py-1 text-center text-sm capitalize transition-colors ${
                        prefs.fontFamily === f
                          ? prefs.isDark
                            ? "bg-white text-black"
                            : "bg-black text-white"
                          : prefs.isDark
                            ? "hover:bg-white/10"
                            : "hover:bg-black/10"
                      }`}
                      style={{ fontFamily: FONT_FAMILY_CSS[f] }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Theme */}
              <div>
                <p
                  className={`mb-2 text-xs uppercase tracking-widest ${mutedClass}`}
                >
                  Theme
                </p>
                <div className="flex gap-1">
                  {[
                    { label: "Light", value: false },
                    { label: "Dark", value: true },
                  ].map(({ label, value }) => (
                    <button
                      key={label}
                      onClick={() =>
                        setPrefs((p) => ({ ...p, isDark: value }))
                      }
                      className={`flex-1 rounded py-1 text-center text-sm transition-colors ${
                        prefs.isDark === value
                          ? prefs.isDark
                            ? "bg-white text-black"
                            : "bg-black text-white"
                          : prefs.isDark
                            ? "hover:bg-white/10"
                            : "hover:bg-black/10"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto">
          {sets.map((vs) => (
            <button
              key={vs.set.id}
              onClick={() => setActiveSetId(vs.set.id)}
              className={`shrink-0 whitespace-nowrap px-4 py-3 text-sm transition-colors ${
                vs.set.id === activeSetId
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
      <div className="flex-1 overflow-y-auto">
        {activeSet && (
          <SetContent set={activeSet} isDark={prefs.isDark} />
        )}
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
          <SlideBlock key={slide.id ?? i} slide={slide} isDark={isDark} />
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
}: {
  slide: SlideRow;
  isDark: boolean;
}) {
  const mutedClass = isDark ? "opacity-40" : "opacity-50";
  return (
    <div className="space-y-1">
      {slide.section && (
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
