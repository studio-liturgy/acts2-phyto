import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isLiveNow } from "@/lib/live-session";
import { PhoneViewer } from "@/components/PhoneViewer";
import type { PhoneSet } from "@/lib/phone-viewer";
import { visibleVersions } from "@/lib/versions";
import {
  parseShareView,
  shareViewVersion,
  type ShareResolution,
  type ShareSetRow,
} from "@/lib/share-view";
import { nextPollDelay } from "@/lib/share-poll";
import { useLibrary } from "@/lib/store";
import { useIsSignedIn } from "@/lib/authStore";
import { NO_GATHERINGS, ownLiveGathering, PHONE_UI } from "@/lib/phone-layout";
import { PhoneAddSetSheet } from "@/components/phone/PhoneAddSetSheet";

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
 *  viewer's only read path (see src/lib/share-view.ts for why). Sending the
 *  version from the last answer gets back "unchanged" instead of the full
 *  payload when nothing moved. Returns "error" on a failed request so the poll
 *  holds its current state and retries, rather than reading a network blip as
 *  "not found" and stopping for good. */
async function fetchShareView(
  token: string,
  version: string | null,
): Promise<{ view: ShareResolution; version: string | null } | "error"> {
  const { data, error } = await supabase.rpc("get_share_view_v2", {
    p_token: token,
    p_version: version,
  });
  if (error) {
    console.warn("[share] get_share_view_v2 failed", error);
    return "error";
  }
  return { view: parseShareView(data), version: shareViewVersion(data) };
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
    ...(set.content?.songLayout === "multilang" && set.content.langs?.length
      ? { langs: set.content.langs, langsShown: set.content.langsShown }
      : {}),
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
  const [arrangementsBySet, setArrangementsBySet] = useState<Record<string, string[]>>({});
  const prevLiveRef = useRef<boolean | null>(null);
  const stoppedRef = useRef(false);

  // The leader's own live gathering, signed in on this device: a + after the
  // tabs adds a set on the fly (test builds, with the phone layout).
  const isSignedIn = useIsSignedIn();
  const localGatherings = useLibrary((s) => s.gatherings ?? NO_GATHERINGS);
  const addSetToGathering = useLibrary((s) => s.addSetToGathering);
  const [addOpen, setAddOpen] = useState(false);
  const ownId =
    PHONE_UI && isSignedIn && status === "live" && gatheringName !== null
      ? ownLiveGathering(
          localGatherings,
          (id) => isLiveNow(localGatherings[id]),
          gatheringName,
          sets.map((s) => s.id),
        )
      : null;
  const addSet = (setId: string) => {
    if (!ownId) return;
    const d = useLibrary.getState().sets[setId];
    if (!d) return;
    addSetToGathering(ownId, setId);
    // Shown at once; the next poll brings the server's copy once it's pushed.
    setSets((prev) => [
      ...prev,
      {
        id: d.id,
        title: d.name,
        type: d.kind,
        content: {
          slides: d.slides as ShareSetRow["content"]["slides"],
          chords: d.chords,
          versions: d.versions,
          songLayout: d.songLayout,
          langs: d.langs,
          langsShown: d.langsShown,
        },
      },
    ]);
  };

  useEffect(() => {
    document.title = gatheringName || "Gathering";
  }, [gatheringName]);

  useEffect(() => {
    stoppedRef.current = false;
    prevLiveRef.current = null;

    let version: string | null = null;
    let lastChangeAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;

    // Polls run one at a time, each scheduling the next, and none while the
    // tab is hidden (see lib/share-poll.ts for the timing).
    const schedule = () => {
      clearTimeout(timer);
      if (stoppedRef.current || document.hidden) return;
      timer = setTimeout(poll, nextPollDelay(lastChangeAt));
    };

    const poll = async () => {
      if (stoppedRef.current || inFlight) return;
      inFlight = true;
      try {
        await check();
      } finally {
        inFlight = false;
      }
      schedule();
    };

    const check = async () => {
      const fetched = await fetchShareView(token, version);
      if (stoppedRef.current || fetched === "error") return;
      const res = fetched.view;
      if (res?.kind === "unchanged") return;
      version = fetched.version;
      lastChangeAt = Date.now();

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

      // A session auto-ends after LIVE_SESSION_MS (14 days), so an abandoned
      // gathering stops being live even though the presenter never flipped the
      // flag. The server's payload changes at that moment, so this runs.
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
        setArrangementsBySet(g.arrangements);
        setStatus("live");
      } else {
        setStatus("not-live");
      }
    };

    // Back in view (phone unlocked, tab reselected): catch up at once.
    const onVisibility = () => {
      if (document.hidden) clearTimeout(timer);
      else void poll();
    };
    document.addEventListener("visibilitychange", onVisibility);

    void poll();
    return () => {
      stoppedRef.current = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
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
  return (
    <>
      <PhoneViewer
        sets={sets.map(toPhoneSet)}
        hiddenBySet={hiddenBySet}
        arrangementsBySet={arrangementsBySet}
        onAddSet={ownId ? () => setAddOpen(true) : undefined}
      />
      {ownId && <PhoneAddSetSheet open={addOpen} onOpenChange={setAddOpen} onPick={addSet} />}
    </>
  );
}
