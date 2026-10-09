import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isLiveNow } from "@/lib/live-session";
import { PhoneViewer } from "@/components/PhoneViewer";
import type { PhoneSet } from "@/lib/phone-viewer";
import { visibleVersions } from "@/lib/versions";
import { parseShareView, type ShareResolution, type ShareSetRow } from "@/lib/share-view";

// Per-gathering share view — private, ephemeral links. Keep out of search.

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
// Fetcher — no auth required
// ---------------------------------------------------------------------------

/** Resolve the token and, while live, fetch its sets in one call. The RPC is the
 *  viewer's only read path (see src/lib/share-view.ts for why). Returns
 *  "error" on a failed request so the poll holds its current state and retries,
 *  rather than reading a network blip as "not found" and stopping for good. */
async function fetchShareView(token: string): Promise<ShareResolution | "error"> {
  const { data, error } = await supabase.rpc("get_share_view", { p_token: token });
  if (error) {
    console.warn("[share] get_share_view failed", error);
    return "error";
  }
  return parseShareView(data);
}

/** Flatten a fetched set row into the shape PhoneViewer renders. */
function toPhoneSet(set: ShareSetRow): PhoneSet {
  const slides = set.content?.slides ?? [];
  return {
    id: set.id,
    title: set.title,
    type: set.type,
    slides,
    chords: set.content?.chords,
    // A stacked scripture shows every version it carries, exactly as the
    // leader's screen does.
    versions: visibleVersions({ versions: set.content?.versions, slides }),
  };
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

function GatheringViewer() {
  const { token } = Route.useParams();
  const [status, setStatus] = useState<Status>("loading");
  const [gatheringName, setGatheringName] = useState<string | null>(null);
  const [sets, setSets] = useState<ShareSetRow[]>([]);
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

      const res = await fetchShareView(token);
      if (stoppedRef.current || res === "error") return;

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

      const g = res.gathering;
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
        setSets(res.sets);
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
  return <PhoneViewer sets={sets.map(toPhoneSet)} hiddenBySet={hiddenBySet} />;
}
