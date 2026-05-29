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
  const prevLiveRef = useRef<boolean | null>(null);
  const stoppedRef = useRef(false);

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
          // First load → select first tab
          if (prev === null) return viewerSets[0]?.set.id ?? null;
          // Keep current selection if it still exists
          if (viewerSets.some((vs) => vs.set.id === prev)) return prev;
          // Silently fall back to first tab if current set was removed
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

  if (status === "loading") {
    return (
      <Screen>
        <p className="text-sm opacity-50">Loading…</p>
      </Screen>
    );
  }

  if (status === "not-found") {
    return (
      <Screen>
        <p>Gathering not found</p>
      </Screen>
    );
  }

  if (status === "not-live") {
    return (
      <Screen>
        <p>This gathering hasn't started yet</p>
      </Screen>
    );
  }

  if (status === "ended") {
    return (
      <Screen>
        <p>This gathering has ended</p>
      </Screen>
    );
  }

  // Live
  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      {/* Horizontal scrollable tab bar */}
      <div className="flex shrink-0 overflow-x-auto border-b border-white/10">
        {sets.map((vs) => (
          <button
            key={vs.set.id}
            onClick={() => setActiveSetId(vs.set.id)}
            className={`shrink-0 whitespace-nowrap px-4 py-3 text-sm transition-colors ${
              vs.set.id === activeSetId
                ? "border-b-2 border-white text-white"
                : "text-white/40"
            }`}
          >
            {vs.set.title}
          </button>
        ))}
      </div>

      {/* Set content */}
      <div className="flex-1 overflow-y-auto">
        {activeSet && <SetContent set={activeSet} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-white">
      {children}
    </div>
  );
}

function SetContent({ set }: { set: SetRow }) {
  const slides = set.content?.slides ?? [];

  if (set.type === "song" || set.type === "scripture") {
    return (
      <div className="space-y-6 px-4 py-6">
        {slides.map((slide, i) => (
          <SlideBlock
            key={slide.id ?? i}
            slide={slide}
            isScripture={set.type === "scripture"}
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
  isScripture,
}: {
  slide: SlideRow;
  isScripture: boolean;
}) {
  return (
    <div className="space-y-1">
      {slide.section && (
        <p className="text-xs uppercase tracking-widest opacity-40">
          {slide.section}
        </p>
      )}
      {slide.title && <p className="font-semibold">{slide.title}</p>}
      {slide.lines?.map((line, j) => (
        <p key={j} className="leading-relaxed">
          {line || " "}
        </p>
      ))}
      {isScripture && slide.reference && (
        <p className="mt-1 text-sm opacity-50">{slide.reference}</p>
      )}
    </div>
  );
}
