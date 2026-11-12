import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { DissolveSlide } from "@/components/SlideView";
import { BackgroundOverride } from "@/lib/background-override";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { APP_NAME } from "@/lib/appConfig";
import { PHONE_UI } from "@/lib/phone-layout";
import {
  PartsBuffer,
  parseMessage,
  reconnectDelay,
  roomPath,
  type RemoteLive,
  type RemoteMeta,
  type RoomToScreen,
  type ScreenToRoom,
} from "@/lib/remote-protocol";
import { isHandheld, screenDevice, type ScreenDevice } from "@/lib/screen-device";
import { visibleVersions } from "@/lib/versions";
import { supabase } from "@/lib/supabase";
import { parseShareView, shareViewVersion } from "@/lib/share-view";
import { isLiveNow } from "@/lib/live-session";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { usePreloadImages } from "@/hooks/use-preload-images";
import { PreloadVideos } from "@/components/PreloadVideos";
import { setsAround, setsMedia } from "@/lib/media-preload";
import type { Set as PhytoSet, Slide } from "@/lib/types";

// Present from a phone (n133): the screen link. Opened on the computer or
// device connected to the TV or projector; a phone in Present drives it as
// the remote. No sign in: it only shows the slides, like /g.

export const Route = createFileRoute("/screen/$slug")({
  head: () => ({
    meta: [
      { title: `Screen | ${APP_NAME}` },
      { name: "robots", content: "noindex" },
      // Opened from the iPhone home screen: no Safari bars over the slides.
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black" },
    ],
  }),
  component: Screen,
});

function Screen() {
  const { slug } = Route.useParams();
  if (!PHONE_UI) return <Navigate to="/" replace />;
  return <ScreenView slug={slug} />;
}

function ScreenView({ slug }: { slug: string }) {
  const [meta, setMeta] = useState<RemoteMeta | null>(null);
  const [sets, setSets] = useState<Record<string, PhytoSet>>({});
  const [live, setLive] = useState<RemoteLive | null>(null);
  const sockRef = useRef<WebSocket | null>(null);

  // The room: replays the gathering and the live slide on every connect,
  // then streams changes. Reconnects on its own; the last slide stays up.
  useEffect(() => {
    let stopped = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;
    let lastSeq = 0;
    const parts = new PartsBuffer();
    const open = () => {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const sock = new WebSocket(`${proto}//${window.location.host}${roomPath(slug, "screen")}`);
      sockRef.current = sock;
      sock.onopen = () => {
        attempts = 0;
        lastSeq = 0;
        ping = setInterval(() => sock.readyState === WebSocket.OPEN && sock.send("ping"), 25_000);
      };
      sock.onmessage = (e) => {
        const m = parseMessage<RoomToScreen>(e.data);
        if (!m) return;
        if (m.t === "hello") {
          parts.clear();
          if (m.empty) {
            setMeta(null);
            setSets({});
            setLive(null);
          }
        } else if (m.t === "reset") {
          parts.clear();
          lastSeq = 0;
          setMeta(null);
          setSets({});
          setLive(null);
        } else if (m.t === "meta") {
          setMeta(m.meta);
        } else if (m.t === "part") {
          const done = parts.add(m);
          if (done) setSets((prev) => ({ ...prev, [done.id]: done }));
        } else if (m.t === "live") {
          if (m.seq < lastSeq) return;
          lastSeq = m.seq;
          setLive(m.live);
        }
      };
      sock.onclose = () => {
        if (ping) clearInterval(ping);
        ping = null;
        if (sockRef.current === sock) sockRef.current = null;
        if (stopped) return;
        timer = setTimeout(open, reconnectDelay(attempts++));
      };
    };
    open();
    // Back from sleep: reconnect at once rather than waiting out the delay.
    const onVisible = () => {
      if (document.visibilityState !== "visible" || sockRef.current) return;
      if (timer) clearTimeout(timer);
      open();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) clearTimeout(timer);
      if (ping) clearInterval(ping);
      sockRef.current?.close(1000);
    };
  }, [slug]);

  // Before a remote connects: is a gathering live on this link at all?
  // Asked through the /g viewer's RPC, with its version so repeat asks come
  // back "unchanged"; every 20 s while waiting, never while hidden, and not
  // at all once the remote is sending.
  const [gatheringLive, setGatheringLive] = useState<boolean | null>(null);
  const waitingForRemote = !meta;
  useEffect(() => {
    if (!waitingForRemote) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let version: string | null = null;
    const ask = async () => {
      if (stopped || document.hidden) return;
      const { data, error } = await supabase.rpc("get_share_view_v2", {
        p_token: slug,
        p_version: version,
      });
      if (stopped) return;
      if (!error) {
        const view = parseShareView(data);
        if (view?.kind === "waiting" || view === null) setGatheringLive(false);
        else if (view.kind === "gathering") setGatheringLive(isLiveNow(view.gathering));
        version = shareViewVersion(data) ?? version;
      }
      timer = setTimeout(ask, 20_000);
    };
    void ask();
    const onVisible = () => {
      if (document.hidden) return;
      if (timer) clearTimeout(timer);
      void ask();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [slug, waitingForRemote]);

  useWakeLock();
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = "black";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.background = prev;
    };
  }, []);

  const [device, setDevice] = useState<ScreenDevice>("computer");
  const [upright, setUpright] = useState(false);
  useEffect(() => {
    setDevice(screenDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0));
    const on = () => setUpright(window.innerHeight > window.innerWidth);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const handheld = isHandheld(device);
  // Already opened from the home screen: no need to offer it.
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    setStandalone(
      (navigator as Navigator & { standalone?: boolean }).standalone === true ||
        window.matchMedia("(display-mode: standalone)").matches,
    );
  }, []);

  // The pop-up. Close is also the tap the browser needs before video can
  // play with sound, and on a computer it goes full screen.
  const [popup, setPopup] = useState<"intro" | "steps" | null>("intro");
  const [armed, setArmed] = useState(false);
  const close = () => {
    setPopup(null);
    setArmed(true);
    if (!handheld) document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const set = live?.setId ? sets[live.setId] : undefined;
  const rawSlide = set?.slides.find((s) => s.id === live?.slideId) ?? null;
  // A set still arriving (or edited away) keeps the last slide up.
  const lastSlide = useRef<Slide | null>(null);
  if (rawSlide) lastSlide.current = rawSlide;
  const slide = rawSlide ?? (live?.setId && live.slideId ? lastSlide.current : null);
  if (!live?.setId) lastSlide.current = null;
  const template =
    set?.kind === "song"
      ? meta?.songTemplate
      : set?.kind === "scripture" || set?.kind === "message"
        ? meta?.scriptureTemplate
        : set?.template;
  const hideContent = !meta || !live || live.clear || !slide;
  const waiting = !meta;

  // Everything the gathering shows, fetched ahead of time: every picture,
  // and the video files of the live set and the next.
  const media = useMemo(() => {
    const ids = meta?.setIds ?? [];
    return {
      images: setsMedia(
        ids.map((id) => sets[id]),
        meta?.background,
      ).images,
      videos: setsMedia(
        setsAround(ids, live?.setId ?? null).map((id) => sets[id]),
        meta?.background,
      ).videos,
    };
  }, [meta, sets, live?.setId]);
  usePreloadImages(media.images);

  const sendEnded = () => {
    const nonce = live?.videoCmd?.nonce ?? 0;
    const m: ScreenToRoom = { t: "ended", nonce };
    if (sockRef.current?.readyState === WebSocket.OPEN) sockRef.current.send(JSON.stringify(m));
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black">
      {hideContent ? (
        <div className="h-full w-full bg-black" />
      ) : (
        <BackgroundOverride.Provider value={meta.background}>
          <DissolveSlide
            slide={slide}
            versions={visibleVersions(set ?? null)}
            variant="stage"
            durationMs={meta.fadeMs}
            template={template}
            videoCmd={live.videoCmd}
            refreshKey={live.refresh}
            onVideoEnded={sendEnded}
            playbackEnabled={armed}
            className="h-full w-full"
          />
        </BackgroundOverride.Provider>
      )}
      <PreloadVideos urls={media.videos} />
      <div
        className="pointer-events-none absolute inset-0 bg-black"
        style={{
          opacity: live?.blackout ? 1 : 0,
          transition:
            (live?.blackoutFadeMs ?? 0) > 0
              ? `opacity ${live?.blackoutFadeMs}ms ease-in-out`
              : undefined,
        }}
      />
      {waiting && popup === null && handheld && upright && (
        <p className="mono pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[10px] uppercase tracking-wider text-white/40">
          Turn this phone sideways
        </p>
      )}
      {/* Nothing until the live check answers, so it never flips. */}
      {waiting && popup === null && gatheringLive !== null && (
        <p className="mono pointer-events-none absolute inset-x-0 bottom-[max(2rem,env(safe-area-inset-bottom))] text-center text-[10px] uppercase tracking-wider text-white/40">
          {gatheringLive ? (
            <>
              Looking for remote
              <LoadingDots />
            </>
          ) : (
            "Gathering is not live"
          )}
        </p>
      )}

      <AlertDialog open={popup !== null}>
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          {popup === "steps" ? (
            <>
              <AlertDialogTitle className="text-2xl font-normal leading-tight">
                Add to Home Screen
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <ol className="mt-4 list-decimal space-y-2 pl-5 text-base text-foreground">
                  <li>Tap the Share icon in Safari&apos;s toolbar.</li>
                  <li>Scroll down and tap Add to Home Screen.</li>
                  <li>
                    Open {APP_NAME} from your home screen. It opens without Safari&apos;s bars, so
                    only the slides show on your TV.
                  </li>
                </ol>
              </AlertDialogDescription>
              <div className="mt-8 flex gap-3">
                <button
                  type="button"
                  onClick={() => setPopup("intro")}
                  className="mono uppercase flex-1 rounded-full border border-foreground py-2 text-sm"
                >
                  Back
                </button>
              </div>
            </>
          ) : (
            <>
              <AlertDialogTitle className="text-2xl font-normal leading-tight">
                Connect a remote
              </AlertDialogTitle>
              <AlertDialogDescription className="mt-4 text-pretty text-base text-foreground">
                The slides are controlled from a phone: open Present in {APP_NAME} and tap Remote.
                Once you&apos;re ready, connect this device to your TV or projector.
              </AlertDialogDescription>
              <div className="mt-8 flex gap-3">
                <button
                  type="button"
                  onClick={close}
                  className="mono uppercase flex-1 rounded-full bg-foreground py-2 text-sm text-background"
                >
                  Close
                </button>
                {device === "ios" && !standalone && (
                  <button
                    type="button"
                    onClick={() => setPopup("steps")}
                    className="mono uppercase flex-1 rounded-full border border-foreground py-2 text-sm"
                  >
                    Add to Home Screen
                  </button>
                )}
              </div>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Three dots coming in one after another, on a loop. They keep their space,
 *  so the words don't shift. */
function LoadingDots() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((v) => (v + 1) % 4), 400);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      {[1, 2, 3].map((i) => (
        <span key={i} className={n >= i ? "opacity-100" : "opacity-0"}>
          .
        </span>
      ))}
    </>
  );
}
