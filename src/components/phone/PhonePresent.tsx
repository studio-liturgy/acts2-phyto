import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Settings,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { PhoneBackHeader, PhoneScreen, PhoneTitleHeader } from "@/components/phone/PhoneChrome";
import { SlideView } from "@/components/SlideView";
import { RemoteIcon } from "@/components/RemoteIcon";
import { NumberStepper } from "@/components/NumberStepper";
import { SongLanguageBar } from "@/components/SongLanguageBar";
import { AutoAdvanceStepper, LoopSwitches } from "@/components/MediaTemplateEditor";
import { TapRange } from "@/components/TapRange";
import { VideoBar } from "@/components/VideoBar";
import { FONT_OPTIONS } from "@/lib/template-fonts";
import { SLIDE_ASPECTS } from "@/lib/background";
import { prepareImageFile } from "@/lib/image-upload";
import { reapplyChords, stripChordsRaw } from "@/lib/chords";

import { kindLiveColor } from "@/lib/kind-live";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { editedLangLines, songLangs } from "@/lib/multiling";
import { visibleVersions } from "@/lib/versions";
import type { Set as PhytoSet } from "@/lib/types";
import { useAccountSlug } from "@/hooks/use-account-slug";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { arrangedEntries, effectiveArrangement, sectionOptions } from "@/lib/arrangements";
import { centeredTabScroll } from "@/lib/phone-viewer";
import { isLiveNow } from "@/lib/live-session";
import { NO_GATHERINGS, NO_IDS, NO_SETS, presentGatheringId } from "@/lib/phone-layout";
import { useRemote } from "@/lib/remote-client";
import { screenLinkUrl } from "@/lib/remote-protocol";
import {
  centredIndex,
  gatheringRun,
  runIndex,
  slotSections,
  stepRun,
  type RunPos,
} from "@/lib/remote-run";
import {
  gatheringSectionsReady,
  isVideoPlaying,
  loadGatheringSections,
  useGatheringSections,
  useLibrary,
  useLive,
  useScriptureTemplateDraft,
  useSongTemplateDraft,
} from "@/lib/store";

// Present from a phone (n133): the phone as the remote. The Remote button,
// then the screen link (QR code and link) until a screen connects, then the
// controls: Controls (a preview row, Previous / Next, Stop, video) and Slides
// (every slide in play order). Both views share one browse position.

const NONE: Record<string, string[]> = {};
const SECTION_TINTS = ["var(--brand-blue)", "var(--brand-green)", "var(--brand-orange)"];
// The Go live sheet's note: full width, at the foot of the screen.
const NOTE =
  "mono mt-8 w-full text-[10px] uppercase leading-snug tracking-wider text-foreground/80";

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
        {/* Laid out like Go live: the circle mid-screen (glowing in and out
            like it), the note at the foot. */}
        <div className="flex h-full flex-col px-6 pb-6">
          <div className="flex flex-1 items-center justify-center">
            <button
              type="button"
              disabled={!share.slug}
              onClick={() => share.slug && useRemote.getState().start(liveId, share.slug)}
              className="mono flex aspect-square w-full max-w-[16rem] animate-pulse items-center justify-center rounded-full bg-foreground text-sm uppercase tracking-wider text-background transition active:opacity-80 disabled:opacity-40"
            >
              Remote
            </button>
          </div>
          <p className={NOTE}>
            {status === "denied"
              ? "Couldn't connect as the remote. Sign in again, then tap Remote."
              : "Control the slides from this phone. Next, open the screen link on the computer or device connected to your TV or projector."}
          </p>
        </div>
      </PhoneScreen>
    );
  }

  return <RemoteView gatheringId={liveId} slug={share.slug ?? remoteSlug ?? ""} />;
}

function RemoteView({ gatheringId, slug }: { gatheringId: string; slug: string }) {
  const status = useRemote((s) => s.status);
  // The last screen closing goes back to the link page.
  const showControls = status === "connected";
  const g = useLibrary((s) => s.gatherings[gatheringId]);
  // Connected: back to Gatherings (the remote stays connected), the
  // gathering's name in the gathering editor's smaller bar with its line
  // underneath, Disconnect on the right. Before that: Present, like the tab.
  const header = showControls ? (
    <PhoneBackHeader
      back="/"
      title={
        <span className="flex min-w-0 items-center gap-0.5">
          <span className="mr-0.5 min-w-0 truncate text-xl tracking-[-0.045em]">{g?.name}</span>
          {/* Edit the gathering, coming back here (as from the live link). */}
          <Link
            to="/present"
            search={{ gathering: gatheringId, remote: true }}
            className="pill flex h-10 w-10 shrink-0 items-center justify-center transition active:bg-foreground/15"
            title="Edit gathering"
            aria-label="Edit gathering"
          >
            <Pencil className="h-4 w-4" />
          </Link>
        </span>
      }
      actions={<DisconnectButton />}
    />
  ) : (
    <PhoneTitleHeader title="Present" />
  );

  return (
    // Connected, the remote fills the screen itself and its Controls /
    // Settings tabs take the bottom bar's place.
    <PhoneScreen tab={showControls ? undefined : "present"} header={header} scroll={!showControls}>
      {showControls ? <Deck gatheringId={gatheringId} /> : <ScreenLink slug={slug} />}
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
    // The same frame as the Remote button's screen, so the note sits in the
    // same place: the QR code about mid-screen, then the link, then Share.
    <div className="flex h-full flex-col px-6 pb-6">
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="rounded-2xl bg-white p-3">
          <QRCodeCanvas
            value={url || "https://phyto.live/"}
            size={180}
            fgColor="#212121"
            bgColor="#ffffff"
          />
        </div>
        <div className="mt-8 flex w-full items-center overflow-hidden rounded-full border border-foreground">
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
        {canShare && (
          <button
            type="button"
            disabled={!url}
            onClick={() => navigator.share({ url }).catch(() => {})}
            className="mono mt-3 w-full rounded-full bg-foreground py-3 text-xs uppercase tracking-wider text-background transition active:opacity-80 disabled:opacity-40"
          >
            Share link
          </button>
        )}
        <div className="mt-3 w-full">
          <DisconnectButton wide />
        </div>
      </div>
      <p className={NOTE}>
        Open this link on the computer or device connected to your TV or projector. The controls
        appear here once it connects.
      </p>
    </div>
  );
}

/** Disconnect: beside the gathering's name once connected, under Share link
 *  on the link page. Asks first, like End Session. */
function DisconnectButton({ wide = false }: { wide?: boolean }) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAsking(true)}
        className={`mono flex items-center justify-center rounded-full border border-[var(--brand-red)] uppercase tracking-wider text-[var(--brand-red)] transition active:bg-[var(--brand-red)] active:text-[var(--brand-white)] ${
          wide ? "w-full py-3 text-xs" : "h-8 px-3 text-[10px]"
        }`}
      >
        Disconnect
      </button>
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          <AlertDialogTitle className="text-2xl font-normal leading-tight">
            Disconnect the remote?
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            The screen goes black until a remote connects again. The gathering stays live.
          </AlertDialogDescription>
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => {
                setAsking(false);
                useRemote.getState().stop();
              }}
              className="mono uppercase flex-1 rounded-full bg-foreground py-2 text-sm text-background"
            >
              Disconnect
            </button>
            <button
              type="button"
              onClick={() => setAsking(false)}
              className="mono uppercase flex-1 rounded-full border border-foreground py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** The browse position (an index into the run). Module level, so leaving
 *  Present and coming back keeps it. */
let sharedBrowse = -1;
/** The Controls view's open tab, kept the same way. */
let sharedTab: "controls" | "settings" = "controls";

/** Once a screen has connected: the remote. */
function Deck({ gatheringId }: { gatheringId: string }) {
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

  return <Controls setIds={setIds} run={run} liveAt={liveAt} go={go} />;
}

function StatusLine() {
  const reconnecting = useRemote((s) => s.reconnecting);
  // Space kept, so the controls never jump when it appears.
  return (
    <p className="mono h-4 text-center text-[10px] uppercase tracking-wider text-[var(--brand-red)]">
      {reconnecting ? "Reconnecting" : ""}
    </p>
  );
}

/** The template a set's slides are drawn with, as in the presenter: the
 *  Song or Scripture Template (or its draft), else the set's own. */
function useSetTemplate(set: PhytoSet | undefined) {
  const songTemplate = useLibrary((s) => s.songTemplate);
  const songDraft = useSongTemplateDraft((s) => s.draft);
  const scriptureTemplate = useLibrary((s) => s.scriptureTemplate);
  const scriptureDraft = useScriptureTemplateDraft((s) => s.draft);
  if (!set) return undefined;
  return set.kind === "song"
    ? (songDraft ?? songTemplate)
    : set.kind === "scripture" || set.kind === "message"
      ? (scriptureDraft ?? scriptureTemplate)
      : set.template;
}

/** A slide thumbnail as the presenter shows it: a 2px border inside the
 *  box (the kind's colour when live, white in dark mode; never clipped), and
 *  its number with the live dot in the corner. Drawn with the current
 *  templates, so template changes show here too. */
function Thumb({
  set,
  slideIndex,
  isLive,
  onClick,
  className = "",
  label,
}: {
  set: PhytoSet;
  slideIndex: number;
  isLive: boolean;
  onClick: () => void;
  className?: string;
  label: string;
}) {
  const slide = set.slides[slideIndex];
  const template = useSetTemplate(set);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`relative block overflow-hidden rounded-lg border-2 text-left ${
        isLive ? "border-[var(--live-color)] dark:border-foreground" : "border-transparent"
      } ${className}`}
      style={isLive ? ({ "--live-color": kindLiveColor(set.kind) } as CSSProperties) : undefined}
    >
      <SlideView
        slide={slide}
        versions={visibleVersions(set)}
        variant="thumb"
        template={template}
      />
      <span className="mono absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white">
        {isLive && (
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: kindLiveColor(set.kind) }}
          />
        )}
        {slideIndex + 1}
      </span>
    </button>
  );
}

/**
 * The browsed set's sections as one row of big chips in their colours that
 * scrolls sideways, keeping the section in view centred as the slides move.
 * The live section has a white outline.
 */
function SectionRow({
  sections,
  labels,
  liveAt,
  browse,
  onPick,
}: {
  sections: { entryKey: string; sectionKey: string; start: number; end: number }[];
  labels: Map<string, { label: string; index: number }>;
  liveAt: number;
  browse: number;
  onPick: (start: number) => void;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const current = sections.findIndex((sec) => browse >= sec.start && browse <= sec.end);
  useEffect(() => {
    const row = rowRef.current;
    const el = row?.children[current] as HTMLElement | undefined;
    if (!row || !el) return;
    row.scrollTo({
      left: el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2,
      behavior: "smooth",
    });
  }, [current]);
  return (
    <div
      ref={rowRef}
      className="relative flex gap-3 overflow-x-auto px-[27%] [scrollbar-width:none]"
    >
      {sections.map((sec) => {
        const opt = labels.get(sec.sectionKey);
        const tint = SECTION_TINTS[(opt?.index ?? 0) % SECTION_TINTS.length];
        const isLive = liveAt >= sec.start && liveAt <= sec.end;
        return (
          <button
            key={sec.entryKey}
            type="button"
            onClick={() => onPick(sec.start)}
            className={`mono flex h-14 min-w-[43%] shrink-0 items-center justify-center whitespace-nowrap rounded-full border-2 px-6 text-sm uppercase tracking-wider text-[var(--brand-white)] ${
              isLive ? "border-white" : "border-transparent"
            }`}
            style={{ backgroundColor: tint }}
          >
            {opt?.label ?? "Untitled"}
          </button>
        );
      })}
    </div>
  );
}

function Controls({
  setIds,
  run,
  liveAt,
  go,
}: {
  setIds: string[];
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
  const [tab, setTab] = useState<"controls" | "settings">(() => sharedTab);
  useEffect(() => {
    sharedTab = tab;
  }, [tab]);

  // Back to current slide only shows once the row has come to rest away
  // from the live slide: never while it glides there (across sections too)
  // or while a finger is still swiping.
  const [settled, setSettled] = useState(true);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Where a glide is headed (a quicknav tap, a new live slide). Until it
  // lands, the set name, quicknav and sections show that slide, not each
  // one the row passes on the way.
  const [target, setTarget] = useState<number | null>(null);
  const settleSoon = (ms: number) => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      setSettled(true);
      setTarget(null);
    }, ms);
  };
  // A new live slide hides it in the same render, before the glide starts.
  const [seenLive, setSeenLive] = useState(liveAt);
  if (seenLive !== liveAt) {
    setSeenLive(liveAt);
    setSettled(false);
  }
  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  const centreOn = (i: number, smooth: boolean) => {
    const row = rowRef.current;
    const el = row?.children[i] as HTMLElement | undefined;
    if (!row || !el) return;
    if (smooth) {
      setSettled(false);
      setTarget(i);
      // Rest is declared by the scroll events; this only covers a glide
      // that never starts (already in place).
      settleSoon(700);
    }
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
  // A new live slide (a tap, Previous / Next, a section): the row follows it.
  const prevLive = useRef(liveAt);
  useEffect(() => {
    if (liveAt >= 0 && liveAt !== prevLive.current) centreOn(liveAt, true);
    else settleSoon(150);
    prevLive.current = liveAt;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveAt]);
  const onScroll = () => {
    const row = rowRef.current;
    if (!row) return;
    setSettled(false);
    settleSoon(150);
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
  // What the controls show: the glide's destination while gliding.
  const shown = target ?? browse;
  const browsed = run[shown];
  const browsedSet = browsed ? sets[browsed.setId] : undefined;
  const playing = isVideoPlaying(live);
  const prev = stepRun(run, liveAt, -1);
  const next = stepRun(run, liveAt, 1);

  // The browsed set's sections in play order, on their colours.
  const sections = browsed && browsed.named ? slotSections(run, browsed.slot) : [];
  const labels = new Map(
    browsedSet ? sectionOptions(browsedSet.slides).map((o) => [o.key, o]) : [],
  );
  // Each slide's section colour in the row (named sections only), so the
  // slides of one section sit on one band.
  const tintOf = (p: RunPos) => {
    if (!p.named) return null;
    const d = sets[p.setId];
    const opt = d ? sectionOptions(d.slides).find((o) => o.key === p.sectionKey) : undefined;
    return SECTION_TINTS[(opt?.index ?? 0) % SECTION_TINTS.length];
  };

  // The mock-ups' proportions, as shares of the screen's width.
  const CIRCLE = "flex aspect-square items-center justify-center rounded-full transition";
  const liveIsVideo = liveSlide?.kind === "video";
  // The (edit) circle: Quick edit for a slide with words; otherwise straight
  // to the set editor.
  const [quickEdit, setQuickEdit] = useState(false);
  const browsedSlide =
    browsed && browsedSet ? browsedSet.slides.find((x) => x.id === browsed.slideId) : undefined;
  const navigate = useNavigate();
  const openSetEditor = () => {
    if (!browsedSet) return;
    void navigate({
      to: "/set/$setId",
      params: { setId: browsedSet.id },
      search: { redirectTo: "/?tab=present" },
    });
  };
  const onEdit = () => {
    if (browsedSlide && (browsedSlide.kind === "lyric" || browsedSlide.kind === "point")) {
      setQuickEdit(true);
    } else openSetEditor();
  };

  return (
    // The screen's whole height: the slides stay on top; under them the
    // Controls / Settings tabs (one always open). Controls sits at the foot,
    // in thumb reach; Settings scrolls.
    <div className="flex h-full flex-col overflow-x-hidden pt-1">
      <StatusLine />
      {run.length === 0 ? (
        <p className="mono px-6 py-16 text-center text-xs uppercase tracking-wider text-muted-foreground">
          This gathering has no slides yet.
        </p>
      ) : (
        <>
          <div className="shrink-0">
            {/* One row of slides, the browsed one in the middle and its
              neighbours faded, each section's slides on one band of its
              colour. Swiping only looks; a tap puts it live. */}
            <div
              ref={rowRef}
              onScroll={onScroll}
              className="relative mt-2 flex snap-x snap-mandatory overflow-x-auto px-[12.5%] [scrollbar-width:none]"
            >
              {run.map((p, i) => {
                const d = sets[p.setId];
                const at = d ? d.slides.findIndex((s) => s.id === p.slideId) : -1;
                const key = `${p.slot}:${p.slideId}:${p.occ}`;
                const prevP = run[i - 1];
                const nextP = run[i + 1];
                const first = !prevP || prevP.slot !== p.slot || prevP.entryKey !== p.entryKey;
                const last = !nextP || nextP.slot !== p.slot || nextP.entryKey !== p.entryKey;
                const tint = tintOf(p);
                return (
                  <div
                    key={key}
                    className={`w-3/4 shrink-0 snap-center p-1.5 ${first && i > 0 ? "ml-3" : ""} ${
                      first ? "rounded-l-xl" : ""
                    } ${last ? "rounded-r-xl" : ""}`}
                    style={
                      tint
                        ? { backgroundColor: `color-mix(in oklab, ${tint} 45%, transparent)` }
                        : undefined
                    }
                  >
                    {d && at >= 0 && (
                      <Thumb
                        set={d}
                        slideIndex={at}
                        isLive={i === liveAt}
                        onClick={() => go(p)}
                        label={`${d.name}, slide ${at + 1}`}
                        className={`w-full transition-opacity duration-200 ${
                          i === browse ? "opacity-100" : "opacity-50"
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {/* The gathering's sets in a row, as on the /g live link: a tap
              brings that set's first slide to the middle of the row (looking
              only; nothing goes live). Stays put with the slides. */}
          <SetTabs
            setIds={setIds}
            sets={sets}
            activeSlot={browsed?.slot ?? -1}
            onReset={() => centreOn(liveAt, true)}
            resetDim={liveAt < 0 || liveAt === browse || !settled}
            onPick={(slot) => {
              const i = run.findIndex((p) => p.slot === slot);
              if (i >= 0) centreOn(i, true);
            }}
          />
          {tab === "settings" ? (
            <div
              key="settings"
              className="min-h-0 flex-1 overflow-y-auto pb-8 duration-200 animate-in fade-in-0"
            >
              <RemoteSettings set={browsedSet} />
            </div>
          ) : (
            // The mock-ups: a band for the sections (or the video's
            // playbar), then four big circles, (edit) Clear / (arrow)
            // (arrow), sized to fit the space left. The band keeps its
            // height when empty, so the circles never move.
            <div
              key="controls"
              className="min-h-0 flex-1 [container-type:size] duration-200 animate-in fade-in-0"
            >
              <div
                className="flex h-full flex-col justify-end gap-3 pb-4"
                style={
                  {
                    "--d":
                      "min(calc((100cqw - 2rem - 0.75rem) / 2), calc((100cqh - 4.5rem - 2.5rem) / 2))",
                  } as CSSProperties
                }
              >
                <div className="flex h-[4.5rem] shrink-0 flex-col justify-center">
                  {liveIsVideo && liveSlide ? (
                    <div className="px-[4%]">
                      <VideoBar slideId={liveSlide.id} showTime />
                    </div>
                  ) : (
                    sections.length > 0 && (
                      <SectionRow
                        sections={sections}
                        labels={labels}
                        liveAt={liveAt}
                        browse={shown}
                        onPick={(start) => go(run[start] ?? null)}
                      />
                    )
                  )}
                </div>
                <div className="grid shrink-0 grid-cols-[var(--d)_var(--d)] justify-center gap-3">
                  {liveIsVideo ? (
                    // (reset) top right, (play/pause) bottom left.
                    <div className="relative h-[var(--d)] w-[var(--d)]">
                      <button
                        type="button"
                        onClick={() => live.restartVideo()}
                        title="Restart video"
                        aria-label="Restart video"
                        className={`${CIRCLE} absolute right-0 top-0 w-[47%] border border-foreground active:bg-foreground/15`}
                      >
                        <RotateCcw className="h-7 w-7" />
                      </button>
                      <button
                        type="button"
                        onClick={() => live.setVideoPlaying(!playing)}
                        title={playing ? "Pause video" : "Play video"}
                        aria-label={playing ? "Pause video" : "Play video"}
                        className={`${CIRCLE} absolute bottom-[3%] left-[5%] w-[47%] border border-foreground active:bg-foreground/15`}
                      >
                        {playing ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7" />}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={onEdit}
                      disabled={!browsedSet}
                      title="Edit"
                      aria-label="Edit"
                      className={`${CIRCLE} w-[var(--d)] border border-foreground active:bg-foreground/15 disabled:opacity-30`}
                    >
                      <Pencil className="h-9 w-9" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => live.toggleBlackout()}
                    className={`${CIRCLE} mono w-[var(--d)] text-sm uppercase tracking-wider ${
                      live.blackout
                        ? "bg-[var(--brand-red)] text-[var(--brand-white)]"
                        : "bg-foreground text-background active:opacity-80"
                    }`}
                    aria-pressed={live.blackout}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    disabled={!prev}
                    onClick={() => go(prev)}
                    className={`${CIRCLE} w-[var(--d)] bg-foreground text-background active:opacity-80 disabled:opacity-30`}
                    aria-label="Previous slide"
                    title="Previous slide"
                  >
                    <ChevronLeft className="h-10 w-10" />
                  </button>
                  <button
                    type="button"
                    disabled={!next}
                    onClick={() => go(next)}
                    className={`${CIRCLE} w-[var(--d)] bg-foreground text-background active:opacity-80 disabled:opacity-30`}
                    aria-label="Next slide"
                    title="Next slide"
                  >
                    <ChevronRight className="h-10 w-10" />
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Controls (a remote) and Settings (a gear) in the bottom bar's
              place, as icons like the app's own tabs. */}
          <nav className="flex shrink-0 border-t border-foreground/15 bg-background px-1.5 pb-[env(safe-area-inset-bottom)]">
            {(
              [
                ["controls", "Controls", RemoteIcon],
                ["settings", "Settings", Settings],
              ] as const
            ).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                onClick={() => setTab(v)}
                aria-label={label}
                title={label}
                aria-pressed={tab === v}
                className={`flex h-[54px] flex-1 items-center justify-center transition-colors ${
                  tab === v ? "text-foreground" : "text-foreground/35"
                }`}
              >
                <Icon className="h-[23px] w-[23px]" strokeWidth={1.5} />
              </button>
            ))}
          </nav>
        </>
      )}
      {browsedSet && browsedSlide && (
        <QuickEdit
          open={quickEdit}
          onOpenChange={setQuickEdit}
          set={browsedSet}
          slideId={browsedSlide.id}
          onEditSet={() => {
            setQuickEdit(false);
            openSetEditor();
          }}
        />
      )}
    </div>
  );
}

/**
 * Quick edit (the (edit) circle): the browsed slide's words, chords kept
 * (re-anchored as on desktop's Fast Edit), saved on Save. Edit set opens
 * the whole set in the set editor, coming back to Present.
 */
function QuickEdit({
  open,
  onOpenChange,
  set,
  slideId,
  onEditSet,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  set: PhytoSet;
  slideId: string;
  onEditSet: () => void;
}) {
  const updateSlide = useLibrary((s) => s.updateSlide);
  const slide = set.slides.find((x) => x.id === slideId);
  const [draft, setDraft] = useState("");
  // Fill the box when it opens (never while it closes).
  useEffect(() => {
    if (open && slide) setDraft((slide.lines ?? []).map(stripChordsRaw).join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const save = () => {
    if (!slide) return;
    const merged = reapplyChords((slide.lines ?? []).join("\n"), draft);
    updateSlide(set.id, slide.id, editedLangLines(slide, merged.split("\n")));
    onOpenChange(false);
  };
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="gap-0 rounded-3xl p-8">
        <AlertDialogTitle className="sr-only">Quick edit</AlertDialogTitle>
        <AlertDialogDescription className="sr-only">
          Edit the words on this slide.
        </AlertDialogDescription>
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={6}
          className="mono w-full resize-none rounded-2xl border border-foreground bg-background p-3 text-base leading-snug outline-none"
        />
        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={save}
            className="mono uppercase flex-1 rounded-full bg-foreground py-2 text-sm text-background"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="mono uppercase flex-1 rounded-full border border-foreground py-2 text-sm"
          >
            Cancel
          </button>
        </div>
        <button
          type="button"
          onClick={onEditSet}
          className="mono uppercase mt-3 w-full rounded-full border border-foreground py-2 text-sm"
        >
          Edit set
        </button>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * The remote's Settings tab: everything for the set in view (the one browsed
 * to, which may not be live yet) at once, laid out as in his mock-ups. Each
 * changes the setting itself, as on desktop, and reaches the screen on the
 * next slide or a tap on the live one.
 */
function RemoteSettings({ set }: { set: PhytoSet | undefined }) {
  const fadeMs = useLibrary((s) => s.fadeMs);
  const setFadeMs = useLibrary((s) => s.setFadeMs);
  const songTemplate = useLibrary((s) => s.songTemplate);
  const setSongTemplate = useLibrary((s) => s.setSongTemplate);
  const scriptureTemplate = useLibrary((s) => s.scriptureTemplate);
  const setScriptureTemplate = useLibrary((s) => s.setScriptureTemplate);
  const background = useLibrary((s) => s.background);
  const setBackground = useLibrary((s) => s.setBackground);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageErr, setImageErr] = useState<string | null>(null);

  const kind = set?.kind;
  const isSong = kind === "song";
  const isScripture = kind === "scripture" || kind === "message";
  const langs = set ? songLangs(set) : [];
  const t = isSong ? songTemplate : scriptureTemplate;
  const setT = isSong ? setSongTemplate : setScriptureTemplate;
  const font = t.fontFamily ?? FONT_OPTIONS[0].value;

  const LABEL = "mono text-[10px] uppercase tracking-wider";
  const PILL =
    "mono flex h-7 items-center justify-center rounded-full border px-3 text-[10px] uppercase tracking-wider transition";
  const on = "border-foreground bg-foreground text-background";
  const off = "border-foreground/40";
  // A setting with two choices as the two halves of one pill, its label
  // above (Position, Case, Reference, Alignment), half the row each.
  const splitSetting = (
    label: string,
    options: [string, ReactNode, string?][],
    value: string,
    onPick: (v: string) => void,
  ) => (
    <div className="min-w-0 flex-1">
      <div className={`${LABEL} mb-2`}>{label}</div>
      <div className="mono flex overflow-hidden rounded-full border border-foreground/40">
        {options.map(([v, content, name], i) => (
          <button
            key={v}
            type="button"
            onClick={() => onPick(v)}
            aria-label={name}
            title={name}
            className={`flex h-7 flex-1 items-center justify-center text-[10px] uppercase tracking-wider transition ${
              i > 0 ? "border-l border-foreground/40" : ""
            } ${value === v ? "bg-foreground text-background" : ""}`}
          >
            {content}
          </button>
        ))}
      </div>
    </div>
  );

  const pickImage = async (file?: File) => {
    if (!file) return;
    setImageBusy(true);
    setImageErr(null);
    let full = false;
    try {
      const prepared = await prepareImageFile(file, () => {
        full = true;
        setImageErr("Out of storage. Remove a background or some media first.");
      });
      if (prepared) setBackground({ bgImage: prepared.url });
      else if (!full) setImageErr("That image could not be read.");
    } finally {
      setImageBusy(false);
    }
  };

  return (
    <div className="space-y-6 px-[5%] pt-5">
      {/* Each setting on its own row. */}
      <div className="flex items-center justify-between gap-4">
        <span className={LABEL}>Fade time</span>
        <div className="flex items-center gap-1">
          <NumberStepper
            value={fadeMs / 1000}
            onChange={(v) => setFadeMs(Math.round(v * 1000))}
            min={0}
            max={5}
            step={0.1}
            format={(n) => n.toFixed(1)}
            boxClassName="w-9"
            decrementLabel="Shorter slide fade"
            incrementLabel="Longer slide fade"
          />
          <span className="text-xs text-muted-foreground">s</span>
        </div>
      </div>
      {kind === "media" && set && (
        <div className="flex items-center justify-between gap-4">
          <span className={LABEL}>Auto advance</span>
          <AutoAdvanceStepper setId={set.id} />
        </div>
      )}
      {(isSong || isScripture) && (
        <div className="flex items-center gap-4">
          <span className={`${LABEL} shrink-0`}>Font size</span>
          <TapRange
            min={1}
            max={2}
            step={0.05}
            value={t.fontScale ?? 1}
            onValue={(v) => setT({ fontScale: v })}
            className="min-w-0 flex-1"
          />
        </div>
      )}

      {(isSong || isScripture) && (
        <div>
          <div className={`${LABEL} mb-2`}>Font type</div>
          {/* Three big circles, together as wide as the screen. */}
          <div className="grid grid-cols-3 gap-3">
            {FONT_OPTIONS.map((f) => (
              <button
                key={f.label}
                type="button"
                onClick={() => setT({ fontFamily: f.value })}
                aria-label={f.label}
                title={f.label}
                style={{ fontFamily: f.value }}
                className={`flex aspect-square items-center justify-center rounded-full border text-2xl transition ${
                  font === f.value ? on : off
                }`}
              >
                {f.short}
              </button>
            ))}
          </div>
        </div>
      )}

      {isSong && (
        <div className="flex gap-3">
          {splitSetting(
            "Position",
            [
              ["top", "Top"],
              ["centre", "Centre"],
            ],
            songTemplate.position ?? "centre",
            (v) => setSongTemplate({ position: v as "top" | "centre" }),
          )}
          {splitSetting(
            "Case",
            [
              ["upper", "All Caps"],
              ["mixed", "Mixed"],
            ],
            songTemplate.textCase ?? "mixed",
            (v) => setSongTemplate({ textCase: v as "upper" | "mixed" }),
          )}
        </div>
      )}

      {isScripture && (
        <div className="flex gap-3">
          {splitSetting(
            "Reference",
            [
              ["above", <ChevronUp key="u" className="h-3.5 w-3.5" />, "Above"],
              ["below", <ChevronDown key="d" className="h-3.5 w-3.5" />, "Below"],
            ],
            scriptureTemplate.referencePosition ?? "below",
            (v) => setScriptureTemplate({ referencePosition: v as "above" | "below" }),
          )}
          {splitSetting(
            "Alignment",
            [
              ["left", "L", "Left"],
              ["center", "C", "Centre"],
            ],
            scriptureTemplate.align ?? "left",
            (v) => setScriptureTemplate({ align: v as "left" | "center" }),
          )}
        </div>
      )}

      {set && langs.length > 0 && (
        <div>
          <div className={`${LABEL} mb-2`}>Languages</div>
          <SongLanguageBar set={set} orientation="horizontal" />
        </div>
      )}

      {kind === "media" && set && (
        <div className="space-y-3">
          <LoopSwitches setId={set.id} />
        </div>
      )}

      {/* Background: Black, White or an image (with its Dim). */}
      <div>
        <div className={`${LABEL} mb-2`}>Background</div>
        <div className="grid grid-cols-3 gap-1">
          {(
            [
              ["black", "Black", "bg-black text-white"],
              ["white", "White", "bg-white text-black"],
            ] as const
          ).map(([v, label, look]) => (
            <button
              key={v}
              type="button"
              onClick={() => setBackground({ bg: v, bgImage: undefined })}
              className={`mono flex h-7 items-center justify-center rounded-full text-[10px] uppercase tracking-wider transition ${look} ${
                !background.bgImage && background.bg === v
                  ? "border-2 border-foreground"
                  : "border border-foreground/40"
              }`}
            >
              {label}
            </button>
          ))}
          <label
            className={`mono flex h-7 cursor-pointer items-center justify-center rounded-full text-[10px] uppercase tracking-wider transition ${
              background.bgImage ? "border-2 border-foreground" : "border border-foreground/40"
            }`}
          >
            {imageBusy ? "Uploading" : "Image"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={imageBusy}
              onChange={(e) => {
                void pickImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {background.bgImage && (
          <div className="mt-3 flex items-center gap-3">
            <span className={`${LABEL} shrink-0`}>Dim</span>
            <TapRange
              min={0}
              max={90}
              step={5}
              value={background.bgDim}
              onValue={(v) => setBackground({ bgDim: v })}
              className="min-w-0 flex-1"
            />
            <span className="mono w-8 text-right text-[10px] tabular-nums">
              {background.bgDim}%
            </span>
          </div>
        )}
        {imageErr && <p className="mt-2 text-[10px] text-destructive">{imageErr}</p>}
      </div>

      {/* Aspect ratio: the screen's shape. */}
      <div>
        <div className={`${LABEL} mb-2`}>Aspect ratio</div>
        <div className="flex flex-wrap gap-2">
          {SLIDE_ASPECTS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setBackground({ aspect: a })}
              className={`${PILL} tabular-nums ${(background.aspect ?? "16:9") === a ? on : off}`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Quicknav: the gathering's sets as a scrolling row of tabs (the /g live
 *  link's), the one in view marked by a thick bar above its name. */
function SetTabs({
  setIds,
  sets,
  activeSlot,
  onPick,
  onReset,
  resetDim,
}: {
  setIds: string[];
  sets: Record<string, PhytoSet>;
  activeSlot: number;
  onPick: (slot: number) => void;
  onReset: () => void;
  resetDim: boolean;
}) {
  const barRef = useRef<HTMLDivElement | null>(null);
  // The set in view is centred where possible, as on the /g link.
  useEffect(() => {
    const bar = barRef.current;
    const el = bar?.children[activeSlot] as HTMLElement | undefined;
    if (!bar || !el) return;
    bar.scrollTo({
      left: centeredTabScroll(el.offsetLeft, el.offsetWidth, bar.clientWidth, bar.scrollWidth),
      behavior: "smooth",
    });
  }, [activeSlot]);
  return (
    // (reset) stays put on the left, like the /g link's menu button; the
    // sets scroll beside it.
    <div className="mt-2 flex shrink-0 items-stretch border-b border-foreground/20">
      <button
        type="button"
        onClick={onReset}
        title="Back to current slide"
        aria-label="Back to current slide"
        className={`flex shrink-0 items-center px-4 transition-opacity ${resetDim ? "opacity-30" : ""}`}
      >
        <RotateCcw className="h-[18px] w-[18px]" />
      </button>
      <div
        ref={barRef}
        className="relative flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]"
      >
        {setIds.map((id, slot) => {
          const d = sets[id];
          const empty = !d || d.slides.length === 0;
          return (
            <button
              key={`${id}#${slot}`}
              type="button"
              disabled={empty}
              onClick={() => onPick(slot)}
              className={`shrink-0 whitespace-nowrap border-t-[3px] px-4 pb-3 pt-2.5 text-sm transition-colors disabled:opacity-40 ${
                slot === activeSlot
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground"
              }`}
            >
              {d?.name ?? "(missing)"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
