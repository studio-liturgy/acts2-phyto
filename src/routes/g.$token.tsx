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

const GATHERING_COLS = "id, title, share_token, is_live, live_started_at, hidden_sections";

function toGatheringRow(data: Record<string, unknown>): GatheringRow {
  return {
    ...(data as unknown as Omit<GatheringRow, "live_started_at" | "hidden_sections">),
    live_started_at: data.live_started_at
      ? new Date(data.live_started_at as string).getTime()
      : null,
    hidden_sections: (data.hidden_sections as Record<string, string[]>) ?? {},
  };
}

/** What a /g/<token> lookup resolved to:
 *  - "gathering": a specific gathering row to drive the live/ended/not-live flow.
 *  - "waiting":   the token is a real account/group slug, but nothing is live in
 *                 that scope right now → a generic waiting page.
 *  - null:        the token matches nothing. */
type Resolution = { kind: "gathering"; row: GatheringRow } | { kind: "waiting" } | null;

/** The one live gathering in a scope ("one live per scope"), or null. Anon can
 *  read gatherings via the public share_token policy, so this works logged-out. */
async function fetchLiveInScope(scope: {
  user_id: string | null;
  group_id: string | null;
}): Promise<GatheringRow | null> {
  const base = supabase.from("gatherings").select(GATHERING_COLS);
  const query = scope.group_id
    ? base.eq("group_id", scope.group_id)
    : base.eq("user_id", scope.user_id as string).is("group_id", null);
  const { data } = await query;
  if (!data?.length) return null;
  const rows = (data as Record<string, unknown>[]).map(toGatheringRow);
  // isLiveNow honours the 24h auto-expiry, so a stale is_live=true row is ignored.
  return rows.find((r) => isLiveNow(r)) ?? null;
}

async function resolveToken(token: string): Promise<Resolution> {
  // 1. Account/group slug → whichever gathering is live in that scope, so the URL
  //    is persistent and follows go-live. Retired slugs resolve the same way, so
  //    old links keep working. Best-effort: if the table doesn't exist yet
  //    (migration not applied), skip to the legacy path below.
  const { data: slugRow } = await supabase
    .from("account_slugs")
    .select("user_id, group_id")
    .eq("slug", token)
    .maybeSingle();
  if (slugRow) {
    const live = await fetchLiveInScope(
      slugRow as { user_id: string | null; group_id: string | null },
    );
    return live ? { kind: "gathering", row: live } : { kind: "waiting" };
  }

  // 2. Legacy direct link: a gathering's own share_token. Keeps every link shared
  //    before this change resolving.
  const { data } = await supabase
    .from("gatherings")
    .select(GATHERING_COLS)
    .eq("share_token", token)
    .maybeSingle();
  if (data) return { kind: "gathering", row: toGatheringRow(data as Record<string, unknown>) };

  return null;
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

      const res = await resolveToken(token);
      if (stoppedRef.current) return;

      if (!res) {
        setStatus("not-found");
        stoppedRef.current = true;
        return;
      }

      // The slug is valid but nothing is live in its scope. If a session was live
      // and just ended, show "ended"; otherwise the generic waiting page.
      if (res.kind === "waiting") {
        const wasLive = prevLiveRef.current;
        prevLiveRef.current = false;
        if (wasLive === true) {
          setStatus("ended");
          stoppedRef.current = true;
          return;
        }
        setStatus("not-live");
        return;
      }

      const g = res.row;
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
