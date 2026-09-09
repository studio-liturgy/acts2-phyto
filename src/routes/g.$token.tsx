import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isLiveNow } from "@/lib/live-session";
import { PhoneViewer, type PhoneSet } from "@/components/PhoneViewer";
import type { SongChords } from "@/lib/chords";

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
  /** Section keys the leader has hidden this session, keyed by set id. These
   *  sections are removed from what viewers see. Server-authoritative, cleared
   *  when a new session starts. */
  hidden_sections: Record<string, string[]>;
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
  content: { slides: SlideRow[]; chords?: SongChords };
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
    .select("id, title, share_token, is_live, live_started_at, hidden_sections")
    .eq("share_token", token)
    .maybeSingle();
  if (!data) return null;
  return {
    ...(data as Omit<GatheringRow, "live_started_at" | "hidden_sections">),
    live_started_at: data.live_started_at ? new Date(data.live_started_at).getTime() : null,
    hidden_sections: (data.hidden_sections as Record<string, string[]>) ?? {},
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

/** Flatten a fetched set row into the shape PhoneViewer renders. */
function toPhoneSet(set: SetRow): PhoneSet {
  return {
    id: set.id,
    title: set.title,
    type: set.type,
    slides: set.content?.slides ?? [],
    chords: set.content?.chords,
  };
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

function GatheringViewer() {
  const { token } = Route.useParams();
  const [status, setStatus] = useState<Status>("loading");
  const [gatheringName, setGatheringName] = useState<string | null>(null);
  const [sets, setSets] = useState<ViewerSet[]>([]);
  const [hiddenBySet, setHiddenBySet] = useState<Record<string, string[]>>({});
  const prevLiveRef = useRef<boolean | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    document.title = gatheringName || "Gathering";
  }, [gatheringName]);

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
      const live = isLiveNow(g);
      const wasLive = prevLiveRef.current;
      prevLiveRef.current = live;

      // Gathering ended — was live, now not.
      if (!live && (wasLive === true || g.is_live)) {
        setStatus("ended");
        stoppedRef.current = true;
        return;
      }

      if (live) {
        const viewerSets = await fetchViewerSets(g.id);
        if (stoppedRef.current) return;
        setSets(viewerSets);
        setHiddenBySet(g.hidden_sections);
        setStatus("live");
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
  return <PhoneViewer sets={sets.map((vs) => toPhoneSet(vs.set))} hiddenBySet={hiddenBySet} />;
}
