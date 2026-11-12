import { Navigate } from "@tanstack/react-router";
import { Check, Copy, Monitor, SlidersHorizontal } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PhoneScreen, PhoneTitleHeader } from "@/components/phone/PhoneChrome";
import { SlideView } from "@/components/SlideView";
import { useAccountSlug } from "@/hooks/use-account-slug";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { arrangedEntries, effectiveArrangement, sectionOptions } from "@/lib/arrangements";
import { isLiveNow } from "@/lib/live-session";
import { NO_GATHERINGS, NO_IDS, NO_SETS, presentGatheringId } from "@/lib/phone-layout";
import { useRemote } from "@/lib/remote-client";
import { screenLinkUrl } from "@/lib/remote-protocol";
import { centredIndex, gatheringRun, runIndex, stepRun, type RunPos } from "@/lib/remote-run";
import {
  gatheringSectionsReady,
  isVideoPlaying,
  loadGatheringSections,
  useGatheringSections,
  useLibrary,
  useLive,
} from "@/lib/store";

// Present from a phone (n133): the phone as the remote. The Remote button,
// then the screen link (QR code and link) until a screen connects, then the
// controls: Controls (a preview row, Previous / Next, Stop, video) and Slides
// (every slide in play order). Both views share one browse position.

const NONE: Record<string, string[]> = {};
const SECTION_TINTS = ["var(--brand-blue)", "var(--brand-green)", "var(--brand-orange)"];
const NOTE =
  "mono text-pretty text-[10px] uppercase leading-snug tracking-wider text-foreground/80";

export function PhonePresent() {
  const gatherings = useLibrary((s) => s.gatherings ?? NO_GATHERINGS);
  const gatheringOrder = useLibrary((s) => s.gatheringOrder ?? NO_IDS);
  const liveId = presentGatheringId(gatheringOrder, gatherings, isLiveNow);
  const g = liveId ? gatherings[liveId] : null;
  const share = useAccountSlug({
    scope: { groupId: g?.group_id ?? null },
    seed: g?.share_token ?? "",
    enabled: !!g,
  });
  const status = useRemote((s) => s.status);
  const remoteSlug = useRemote((s) => s.slug);
  const remoteGathering = useRemote((s) => s.gatheringId);

  // Follow the live gathering: another one going live moves the remote over;
  // a different link (another workspace) disconnects it.
  useEffect(() => {
    if (status === "idle" || status === "denied") return;
    if (!liveId || !share.slug || share.slug !== remoteSlug) {
      if (share.slug && share.slug !== remoteSlug) useRemote.getState().stop();
      return;
    }
    if (liveId !== remoteGathering) useRemote.getState().start(liveId, share.slug);
  }, [status, liveId, share.slug, remoteSlug, remoteGathering]);

  useWakeLock(status !== "idle");
  const loaded = useLibrary((s) => s.libraryLoaded);

  if (!loaded) {
    return (
      <PhoneScreen tab="present" header={<PhoneTitleHeader title="Present" />}>
        {null}
      </PhoneScreen>
    );
  }
  if (!g || !liveId) return <Navigate to="/" search={{ tab: "gatherings" }} replace />;

  if (status === "idle" || status === "denied") {
    return (
      <PhoneScreen tab="present" header={<PhoneTitleHeader title="Present" />}>
        <div className="flex h-full flex-col items-center justify-center gap-6 px-6">
          <button
            type="button"
            disabled={!share.slug}
            onClick={() => share.slug && useRemote.getState().start(liveId, share.slug)}
            className="mono flex aspect-square w-full max-w-[16rem] items-center justify-center rounded-full bg-foreground text-sm uppercase tracking-wider text-background transition active:opacity-80 disabled:opacity-40"
          >
            Remote
          </button>
          {status === "denied" && (
            <p className={`${NOTE} text-center`}>
              Couldn&apos;t connect as the remote. Sign in again, then tap Remote.
            </p>
          )}
        </div>
      </PhoneScreen>
    );
  }

  return <RemoteView gatheringId={liveId} slug={share.slug ?? remoteSlug ?? ""} />;
}

function RemoteView({ gatheringId, slug }: { gatheringId: string; slug: string }) {
  const status = useRemote((s) => s.status);
  const everConnected = useRemote((s) => s.everConnected);
  const [view, setView] = useState<"controls" | "slides">("controls");
  const showControls = everConnected || status === "connected";

  const toggle = (
    <div className="flex h-8 items-center rounded-full border border-foreground p-0.5">
      {(
        [
          ["controls", "Controls", SlidersHorizontal],
          ["slides", "Slides", Monitor],
        ] as const
      ).map(([v, label, Icon]) => (
        <button
          key={v}
          type="button"
          onClick={() => setView(v)}
          aria-label={label}
          aria-pressed={view === v}
          title={label}
          className={`flex h-full w-8 items-center justify-center rounded-full transition ${
            view === v ? "bg-foreground text-background" : "text-muted-foreground"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );

  return (
    <PhoneScreen
      tab="present"
      header={<PhoneTitleHeader title="Present" actions={showControls ? toggle : undefined} />}
    >
      {showControls ? <Deck gatheringId={gatheringId} view={view} /> : <ScreenLink slug={slug} />}
    </PhoneScreen>
  );
}

/** Before a screen connects: the screen link to open on the TV's device. */
function ScreenLink({ slug }: { slug: string }) {
  const url =
    slug && typeof window !== "undefined" ? screenLinkUrl(window.location.origin, slug) : "";
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && !!navigator.share;
  return (
    <div className="flex min-h-full flex-col px-6 pb-6 pt-2">
      {canShare && (
        <button
          type="button"
          disabled={!url}
          onClick={() => navigator.share({ url }).catch(() => {})}
          className="mono mb-4 w-full rounded-full bg-foreground py-3 text-xs uppercase tracking-wider text-background transition active:opacity-80 disabled:opacity-40"
        >
          Share link
        </button>
      )}
      <div className="flex items-center overflow-hidden rounded-full border border-foreground">
        <span
          className={`flex-1 truncate px-4 font-mono text-sm uppercase ${url ? "text-foreground" : "text-muted-foreground"}`}
        >
          {url || "Loading link"}
        </span>
        <button
          type="button"
          disabled={!url}
          onClick={() => {
            navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition hover:opacity-90 disabled:opacity-40"
          aria-label="Copy URL"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <div className="mt-10 flex justify-center">
        <div className="rounded-2xl bg-white p-3">
          <QRCodeCanvas
            value={url || "https://phyto.live/"}
            size={180}
            fgColor="#212121"
            bgColor="#ffffff"
          />
        </div>
      </div>
      <p className={`${NOTE} mt-8`}>
        Open this link on the computer or device connected to your TV or projector. The controls
        appear here once it connects.
      </p>
      <div className="mt-auto pt-8">
        <DisconnectButton />
      </div>
    </div>
  );
}

function DisconnectButton() {
  return (
    <button
      type="button"
      onClick={() => useRemote.getState().stop()}
      className="mono w-full rounded-full border border-[var(--brand-red)] py-3 text-xs uppercase tracking-wider text-[var(--brand-red)] transition active:bg-[var(--brand-red)] active:text-[var(--brand-white)]"
    >
      Disconnect
    </button>
  );
}

/** The browse position both views share (an index into the run). Module
 *  level, so switching views (or tabs) keeps it. */
let sharedBrowse = -1;

/** Once a screen has connected: the two views. */
function Deck({ gatheringId, view }: { gatheringId: string; view: "controls" | "slides" }) {
  const g = useLibrary((s) => s.gatherings[gatheringId]);
  const sets = useLibrary((s) => s.sets ?? NO_SETS);
  const hidden = useGatheringSections((s) => s.hidden[gatheringId]) ?? NONE;
  const arranged = useGatheringSections((s) => s.arranged[gatheringId]) ?? NONE;
  useEffect(() => {
    if (!gatheringSectionsReady(useGatheringSections.getState(), gatheringId)) {
      void loadGatheringSections(gatheringId);
    }
  }, [gatheringId]);
  const setIds = g?.setIds ?? NO_IDS;
  const run = useMemo(
    () => gatheringRun(setIds, sets, arranged, hidden),
    [setIds, sets, arranged, hidden],
  );
  const live = useLive();
  const liveAt = runIndex(run, live);
  const go = (p: RunPos | null) => p && live.go(p.setId, p.slideId, p.occ);

  return view === "controls" ? (
    <Controls run={run} liveAt={liveAt} go={go} />
  ) : (
    <SlidesList gatheringId={gatheringId} run={run} liveAt={liveAt} go={go} />
  );
}

function StatusLine() {
  const screens = useRemote((s) => s.screens);
  const reconnecting = useRemote((s) => s.reconnecting);
  // Space kept, so the controls never jump when it appears.
  const text = reconnecting ? "Reconnecting" : screens === 0 ? "No screen connected" : "";
  return (
    <p className="mono h-4 text-center text-[10px] uppercase tracking-wider text-[var(--brand-red)]">
      {text}
    </p>
  );
}

function Controls({
  run,
  liveAt,
  go,
}: {
  run: RunPos[];
  liveAt: number;
  go: (p: RunPos | null) => void;
}) {
  const sets = useLibrary((s) => s.sets ?? NO_SETS);
  const live = useLive();
  const rowRef = useRef<HTMLDivElement | null>(null);
  // Where to open: the shared browse position, else the live slide.
  const opening = () =>
    sharedBrowse >= 0 && sharedBrowse < run.length ? sharedBrowse : Math.max(0, liveAt);
  const [browse, setBrowse] = useState(opening);

  const centreOn = (i: number, smooth: boolean) => {
    const row = rowRef.current;
    const el = row?.children[i] as HTMLElement | undefined;
    if (!row || !el) return;
    row.scrollTo({
      left: el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2,
      behavior: smooth ? "smooth" : "instant",
    });
  };
  // Open on the shared browse position (or the live slide).
  useLayoutEffect(() => {
    centreOn(opening(), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A new live slide (a tap, Previous / Next): the row follows it.
  const prevLive = useRef(liveAt);
  useEffect(() => {
    if (liveAt >= 0 && liveAt !== prevLive.current) centreOn(liveAt, true);
    prevLive.current = liveAt;
  }, [liveAt]);
  const onScroll = () => {
    const row = rowRef.current;
    if (!row) return;
    const items = Array.from(row.children).map((c) => {
      const el = c as HTMLElement;
      return { left: el.offsetLeft, width: el.offsetWidth };
    });
    const i = centredIndex(items, row.scrollLeft, row.clientWidth);
    if (i >= 0 && i !== browse) {
      sharedBrowse = i;
      setBrowse(i);
    }
  };

  const liveSlide =
    live.setId && live.slideId
      ? sets[live.setId]?.slides.find((s) => s.id === live.slideId)
      : undefined;
  const browsed = run[browse];
  const browsedSet = browsed ? sets[browsed.setId] : undefined;
  const playing = isVideoPlaying(live);

  return (
    <div className="flex min-h-full flex-col pb-6 pt-1">
      <StatusLine />
      {run.length === 0 ? (
        <p className="mono px-6 py-16 text-center text-xs uppercase tracking-wider text-muted-foreground">
          This gathering has no slides yet.
        </p>
      ) : (
        <>
          {/* One row of slides, the browsed one in the middle and its
              neighbours faded. Swiping only looks; a tap puts it live. */}
          <div
            ref={rowRef}
            onScroll={onScroll}
            className="relative mt-2 flex [scrollbar-width:none] snap-x snap-mandatory gap-3 overflow-x-auto px-[25%]"
          >
            {run.map((p, i) => {
              const d = sets[p.setId];
              const slide = d?.slides.find((s) => s.id === p.slideId);
              if (!d || !slide) return <div key={`${p.slot}:${p.slideId}:${p.occ}`} />;
              return (
                <button
                  key={`${p.slot}:${p.slideId}:${p.occ}`}
                  type="button"
                  onClick={() => go(p)}
                  className={`relative w-1/2 shrink-0 snap-center overflow-hidden rounded-md transition-opacity duration-200 ${
                    i === browse ? "opacity-100" : "opacity-50"
                  } ${i === liveAt ? "ring-2 ring-[var(--brand-red)]" : ""}`}
                  aria-label={`${d.name}, slide ${i + 1}`}
                >
                  <SlideView slide={slide} versions={d.versions} variant="thumb" />
                </button>
              );
            })}
          </div>
          <p className="mono mt-3 truncate px-6 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
            {browsedSet?.name ?? "\u00a0"}
          </p>
          <div className="mt-2 flex h-8 justify-center">
            <BackToCurrent
              hidden={liveAt < 0 || liveAt === browse}
              onClick={() => centreOn(liveAt, true)}
            />
          </div>

          <div className="mt-4 flex gap-3 px-6">
            <button
              type="button"
              disabled={!stepRun(run, liveAt, -1)}
              onClick={() => go(stepRun(run, liveAt, -1))}
              className="mono h-16 flex-1 rounded-full border border-foreground text-sm uppercase tracking-wider transition active:bg-foreground active:text-background disabled:opacity-30"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!stepRun(run, liveAt, 1)}
              onClick={() => go(stepRun(run, liveAt, 1))}
              className="mono h-16 flex-1 rounded-full bg-foreground text-sm uppercase tracking-wider text-background transition active:opacity-80 disabled:opacity-30"
            >
              Next
            </button>
          </div>

          <div className="mt-3 flex gap-3 px-6">
            <button
              type="button"
              onClick={() => live.toggleBlackout()}
              className={`mono h-12 flex-1 rounded-full border text-xs uppercase tracking-wider transition ${
                live.blackout
                  ? "border-[var(--brand-red)] bg-[var(--brand-red)] text-[var(--brand-white)]"
                  : "border-foreground"
              }`}
              aria-pressed={live.blackout}
            >
              Stop
            </button>
            {liveSlide?.kind === "video" && (
              <>
                <button
                  type="button"
                  onClick={() => live.setVideoPlaying(!playing)}
                  className="mono h-12 flex-1 rounded-full border border-foreground text-xs uppercase tracking-wider transition active:bg-foreground active:text-background"
                >
                  {playing ? "Stop video" : "Play video"}
                </button>
                <button
                  type="button"
                  onClick={() => live.restartVideo()}
                  className="mono h-12 flex-1 rounded-full border border-foreground text-xs uppercase tracking-wider transition active:bg-foreground active:text-background"
                >
                  Restart
                </button>
              </>
            )}
          </div>
        </>
      )}
      <div className="mt-auto px-6 pt-8">
        <DisconnectButton />
      </div>
    </div>
  );
}

function BackToCurrent({ hidden, onClick }: { hidden: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mono rounded-full border border-foreground bg-background px-4 text-[10px] uppercase tracking-wider transition-opacity duration-200 active:bg-foreground active:text-background ${
        hidden ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      tabIndex={hidden ? -1 : 0}
    >
      Back to current slide
    </button>
  );
}

/** Every slide in play order, set by set, sections on their colours (the
 *  gathering's Desktop view). A tap puts a slide live. */
function SlidesList({
  gatheringId,
  run,
  liveAt,
  go,
}: {
  gatheringId: string;
  run: RunPos[];
  liveAt: number;
  go: (p: RunPos | null) => void;
}) {
  const g = useLibrary((s) => s.gatherings[gatheringId]);
  const sets = useLibrary((s) => s.sets ?? NO_SETS);
  const hidden = useGatheringSections((s) => s.hidden[gatheringId]) ?? NONE;
  const arranged = useGatheringSections((s) => s.arranged[gatheringId]) ?? NONE;
  const listRef = useRef<HTMLDivElement | null>(null);
  const [liveInView, setLiveInView] = useState(true);

  const item = (i: number) =>
    listRef.current?.querySelector<HTMLElement>(`[data-run="${i}"]`) ?? null;
  const scrollToItem = (i: number, smooth: boolean) =>
    item(i)?.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "instant" });

  // Open where the Controls row was.
  useLayoutEffect(() => {
    scrollToItem(
      sharedBrowse >= 0 && sharedBrowse < run.length ? sharedBrowse : Math.max(0, liveAt),
      false,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track the slide nearest the middle (the shared browse position) and
  // whether the live slide is on screen.
  useEffect(() => {
    const scroller = listRef.current?.parentElement;
    if (!scroller) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const box = scroller.getBoundingClientRect();
      const mid = box.top + box.height / 2;
      let best = -1;
      let dist = Infinity;
      let seen = false;
      listRef.current?.querySelectorAll<HTMLElement>("[data-run]").forEach((el) => {
        const r = el.getBoundingClientRect();
        const i = Number(el.dataset.run);
        const d = Math.abs(r.top + r.height / 2 - mid);
        if (d < dist) {
          dist = d;
          best = i;
        }
        if (i === liveAt && r.bottom > box.top && r.top < box.bottom) seen = true;
      });
      if (best >= 0) sharedBrowse = best;
      setLiveInView(liveAt < 0 || seen);
    };
    const on = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    scroller.addEventListener("scroll", on, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", on);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [liveAt, run]);

  let at = 0;
  return (
    <div className="relative">
      <div className="sticky top-0 z-10 bg-background px-6 pb-1 pt-1">
        <StatusLine />
      </div>
      <div ref={listRef} className="space-y-6 px-5 pb-28 pt-3">
        {(g?.setIds ?? NO_IDS).map((id, slot) => {
          const d = sets[id];
          if (!d) return null;
          const order = arrangedEntries(
            d.slides,
            effectiveArrangement(d.slides, arranged[id], hidden[id]),
          );
          const labels = new Map(sectionOptions(d.slides).map((o) => [o.key, o]));
          const named = order.some(({ group }) => group.section !== null);
          return (
            <section key={`${id}#${slot}`}>
              <div className="mb-2 flex items-center gap-2">
                <span className="mono text-[10px] text-muted-foreground">{slot + 1}.</span>
                <span className="min-w-0 truncate text-base">{d.name}</span>
              </div>
              <div className="space-y-2">
                {order.map(({ group, entryKey }) => {
                  const opt = labels.get(group.key);
                  const tint = SECTION_TINTS[(opt?.index ?? 0) % SECTION_TINTS.length];
                  return (
                    <div
                      key={entryKey}
                      className={named ? "space-y-2 rounded-xl p-2" : "space-y-2"}
                      style={
                        named
                          ? { backgroundColor: `color-mix(in oklab, ${tint} 45%, transparent)` }
                          : undefined
                      }
                    >
                      {named && (
                        <p className="mono px-1 text-[10px] uppercase tracking-wider">
                          {opt?.label ?? "Untitled"}
                        </p>
                      )}
                      {group.items.map(({ slide }) => {
                        const i = at++;
                        const p = run[i];
                        return (
                          <button
                            key={`${slide.id}@${i}`}
                            type="button"
                            data-run={i}
                            onClick={() => go(p ?? null)}
                            className={`relative block w-full overflow-hidden rounded-md ${
                              i === liveAt ? "ring-2 ring-[var(--brand-red)]" : ""
                            }`}
                          >
                            <SlideView slide={slide} versions={d.versions} variant="thumb" />
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(54px+env(safe-area-inset-bottom)+1rem)] z-20 flex h-8 justify-center">
        <div className="pointer-events-auto">
          <BackToCurrent hidden={liveInView} onClick={() => scrollToItem(liveAt, true)} />
        </div>
      </div>
    </div>
  );
}
