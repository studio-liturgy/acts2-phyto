import { Navigate, useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Monitor,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  SlidersHorizontal,
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
} from "react";
import { PhoneBackHeader, PhoneScreen, PhoneTitleHeader } from "@/components/phone/PhoneChrome";
import { SlideView } from "@/components/SlideView";
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
import { balanceRows } from "@/lib/balance-rows";
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
  const [view, setView] = useState<"controls" | "slides">("controls");
  // The last screen closing goes back to the link page.
  const showControls = status === "connected";

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

  const g = useLibrary((s) => s.gatherings[gatheringId]);
  // Connected: the gathering's name in the smaller bar of the gathering
  // editor, with its line underneath. Before that: Present, like the tab.
  const header = showControls ? (
    <PhoneBackHeader
      back={null}
      title={
        <span className="flex min-w-0 items-center gap-3">
          <span className="min-w-0 truncate text-xl tracking-[-0.045em]">{g?.name}</span>
          <DisconnectButton />
        </span>
      }
      actions={toggle}
    />
  ) : (
    <PhoneTitleHeader title="Present" />
  );

  return (
    // Controls fills the screen itself (the slides on top, the controls at
    // the foot); the link page and Slides scroll as usual.
    <PhoneScreen tab="present" header={header} scroll={!(showControls && view === "controls")}>
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

/** The browse position both views share (an index into the run). Module
 *  level, so switching views (or tabs) keeps it. */
let sharedBrowse = -1;
/** The Controls view's open tab, kept the same way. */
let sharedTab: "controls" | "settings" = "controls";

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
 * The browsed set's sections beside the edit circle, stacked as tall pills in
 * their colours. They size to fit the circle's height: few sections, big
 * pills; many, smaller ones; when they'd get too small to read, they wrap
 * into balanced rows instead (lib/balance-rows: no pill alone on a row).
 */
function SectionColumn({
  sections,
  labels,
  liveAt,
  onPick,
}: {
  sections: { entryKey: string; sectionKey: string; start: number; end: number }[];
  labels: Map<string, { label: string; index: number }>;
  liveAt: number;
  onPick: (start: number) => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [rows, setRows] = useState<number[]>([sections.length]);
  const sig = sections.map((s) => s.entryKey).join("|");
  const GAP = 8;
  const MAX = 50;
  const MIN = 30;
  const n = sections.length;
  const stackedH = n > 0 ? (box.h - GAP * (n - 1)) / n : 0;
  const stacked = stackedH >= MIN;
  useLayoutEffect(() => {
    const el = boxRef.current;
    const measure = measureRef.current;
    if (!el || !measure) return;
    const run = () => {
      setBox({ w: el.clientWidth, h: el.clientHeight });
      const widths = Array.from(measure.firstElementChild?.children ?? []).map(
        (c) => (c as HTMLElement).getBoundingClientRect().width,
      );
      setRows(balanceRows(widths, 6, el.clientWidth));
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sig]);

  const pill = (sec: (typeof sections)[number], mode: "stack" | "wrap" | "measure") => {
    const opt = labels.get(sec.sectionKey);
    const tint = SECTION_TINTS[(opt?.index ?? 0) % SECTION_TINTS.length];
    const isLive = liveAt >= sec.start && liveAt <= sec.end;
    return (
      <button
        key={sec.entryKey}
        type="button"
        tabIndex={mode === "measure" ? -1 : 0}
        onClick={mode === "measure" ? undefined : () => onPick(sec.start)}
        className={`mono flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border-2 px-3 text-[10px] uppercase tracking-wider text-[var(--brand-white)] ${
          isLive ? "border-foreground" : "border-transparent"
        } ${mode === "stack" ? "w-full" : "h-7"}`}
        style={{
          backgroundColor: tint,
          ...(mode === "stack" ? { height: Math.min(MAX, stackedH) } : {}),
        }}
      >
        {opt?.label ?? "Untitled"}
      </button>
    );
  };

  let at = 0;
  return (
    <div ref={boxRef} className="relative h-full min-w-0">
      {/* Unseen copy at natural width, to measure each pill for wrapping. */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden"
      >
        <div className="flex w-max gap-1.5">{sections.map((sec) => pill(sec, "measure"))}</div>
      </div>
      {box.h > 0 &&
        (stacked ? (
          <div className="flex h-full flex-col justify-center" style={{ gap: GAP }}>
            {sections.map((sec) => pill(sec, "stack"))}
          </div>
        ) : (
          <div className="flex h-full flex-col items-end justify-center gap-1.5 overflow-y-auto">
            {rows.map((len, r) => {
              const row = sections.slice(at, at + len);
              at += len;
              return (
                <div key={r} className="flex justify-end gap-1.5">
                  {row.map((sec) => pill(sec, "wrap"))}
                </div>
              );
            })}
          </div>
        ))}
    </div>
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
  const [tab, setTab] = useState<"controls" | "settings">(() => sharedTab);
  useEffect(() => {
    sharedTab = tab;
  }, [tab]);

  // Back to current slide only shows once the row has come to rest away
  // from the live slide: never while it glides there (across sections too)
  // or while a finger is still swiping.
  const [settled, setSettled] = useState(true);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleSoon = (ms: number) => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => setSettled(true), ms);
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
  const browsed = run[browse];
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
          {/* Controls | Settings, each centred in its half, a line between. */}
          <div className="mt-3 flex shrink-0 items-stretch border-b border-foreground/20 pb-2">
            {(
              [
                ["controls", "Controls"],
                ["settings", "Settings"],
              ] as const
            ).map(([v, label], i) => (
              <Fragment key={v}>
                {i > 0 && <span aria-hidden className="w-px bg-foreground/30" />}
                <button
                  type="button"
                  onClick={() => setTab(v)}
                  aria-pressed={tab === v}
                  className={`mono flex-1 text-center text-[10px] uppercase leading-5 tracking-wider transition-colors ${
                    tab === v ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              </Fragment>
            ))}
          </div>
          {tab === "settings" ? (
            <div className="min-h-0 flex-1 overflow-y-auto pb-8">
              <RemoteSettings set={browsedSet} />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-[5%] pb-5">
              <div className="mt-auto" />
              {/* (reset) and the set's title. */}
              <div className="flex items-center gap-[4%] pt-4">
                <button
                  type="button"
                  onClick={() => centreOn(liveAt, true)}
                  disabled={liveAt < 0}
                  title="Back to current slide"
                  aria-label="Back to current slide"
                  className={`${CIRCLE} w-[22%] shrink-0 border border-foreground active:bg-foreground/15 disabled:opacity-30 ${
                    liveAt >= 0 && (liveAt === browse || !settled) ? "opacity-30" : ""
                  }`}
                >
                  <RotateCcw className="h-6 w-6" />
                </button>
                <p className="mono line-clamp-2 min-w-0 flex-1 break-words text-right text-[8vw] uppercase leading-[1.05] tracking-wider">
                  {browsedSet?.name ?? ""}
                </p>
              </div>
              {liveIsVideo ? (
                // A video live: (play/pause) and Restart.
                <div className="mt-[3%] grid grid-cols-2 gap-[3.5%]">
                  <button
                    type="button"
                    onClick={() => live.setVideoPlaying(!playing)}
                    title={playing ? "Pause video" : "Play video"}
                    aria-label={playing ? "Pause video" : "Play video"}
                    className={`${CIRCLE} w-full border border-foreground active:bg-foreground/15`}
                  >
                    {playing ? <Pause className="h-10 w-10" /> : <Play className="h-10 w-10" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => live.restartVideo()}
                    className={`${CIRCLE} mono w-full border border-foreground text-sm uppercase tracking-wider active:bg-foreground/15`}
                  >
                    Restart
                  </button>
                </div>
              ) : (
                // (edit) and the set's sections.
                <div className="mt-[3%] grid grid-cols-[45%_1fr] gap-[3.5%]">
                  <button
                    type="button"
                    onClick={onEdit}
                    disabled={!browsedSet}
                    title="Edit"
                    aria-label="Edit"
                    className={`${CIRCLE} w-full border border-foreground active:bg-foreground/15 disabled:opacity-30`}
                  >
                    <Pencil className="h-10 w-10" />
                  </button>
                  {sections.length > 0 ? (
                    <SectionColumn
                      sections={sections}
                      labels={labels}
                      liveAt={liveAt}
                      onPick={(start) => go(run[start] ?? null)}
                    />
                  ) : (
                    <div />
                  )}
                </div>
              )}
              {/* The video's playbar, just above the arrows and Clear. */}
              {liveIsVideo && liveSlide && (
                <div className="mt-5">
                  <VideoBar slideId={liveSlide.id} />
                </div>
              )}
              {/* (arrow) Clear (arrow). */}
              <div className="mt-[4%] flex items-stretch gap-[2%]">
                <button
                  type="button"
                  disabled={!prev}
                  onClick={() => go(prev)}
                  className={`${CIRCLE} w-[17%] shrink-0 bg-foreground text-background active:opacity-80 disabled:opacity-30`}
                  aria-label="Previous slide"
                  title="Previous slide"
                >
                  <ChevronLeft className="h-7 w-7" />
                </button>
                <button
                  type="button"
                  onClick={() => live.toggleBlackout()}
                  className={`mono flex-1 rounded-full text-sm uppercase tracking-wider transition ${
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
                  disabled={!next}
                  onClick={() => go(next)}
                  className={`${CIRCLE} w-[17%] shrink-0 bg-foreground text-background active:opacity-80 disabled:opacity-30`}
                  aria-label="Next slide"
                  title="Next slide"
                >
                  <ChevronRight className="h-7 w-7" />
                </button>
              </div>
            </div>
          )}
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
        <AlertDialogTitle className="text-2xl font-normal leading-tight">
          Quick edit
        </AlertDialogTitle>
        <AlertDialogDescription className="sr-only">
          Edit the words on this slide.
        </AlertDialogDescription>
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={6}
          className="mono mt-4 w-full resize-none rounded-2xl border border-foreground bg-background p-3 text-base leading-snug outline-none"
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
  // Two halves of one pill (Reference, Alignment).
  const half = (active: boolean, first: boolean) =>
    `flex h-7 flex-1 items-center justify-center text-[10px] transition ${first ? "border-r border-foreground/40" : ""} ${
      active ? "bg-foreground text-background" : ""
    }`;

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
      {/* Fade time, then Font size (or Auto advance for media). */}
      <div className="grid grid-cols-2 items-center gap-x-4">
        <div className="flex items-center gap-3">
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
        {(isSong || isScripture) && (
          <div className="flex items-center gap-3">
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
        {kind === "media" && set && (
          <div className="flex items-center gap-3">
            <span className={`${LABEL} shrink-0`}>Auto advance</span>
            <AutoAdvanceStepper setId={set.id} />
          </div>
        )}
      </div>

      {(isSong || isScripture) && (
        <div className="grid grid-cols-2 gap-x-4">
          <div>
            <div className={`${LABEL} mb-2`}>Font type</div>
            <div className="flex gap-1">
              {FONT_OPTIONS.map((f) => (
                <button
                  key={f.label}
                  type="button"
                  onClick={() => setT({ fontFamily: f.value })}
                  aria-label={f.label}
                  title={f.label}
                  style={{ fontFamily: f.value }}
                  className={`flex h-7 flex-1 items-center justify-center rounded-full border text-xs transition ${
                    font === f.value ? on : off
                  }`}
                >
                  {f.short}
                </button>
              ))}
            </div>
          </div>
          {isSong ? (
            <div>
              <div className={`${LABEL} mb-2`}>Position</div>
              <div className="flex gap-1">
                {(
                  [
                    ["top", "Top"],
                    ["centre", "Centre"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSongTemplate({ position: v })}
                    className={`${PILL} flex-1 ${(songTemplate.position ?? "centre") === v ? on : off}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <div className="flex-1">
                <div className={`${LABEL} mb-2`}>Reference</div>
                <div className="flex overflow-hidden rounded-full border border-foreground/40">
                  <button
                    type="button"
                    onClick={() => setScriptureTemplate({ referencePosition: "above" })}
                    aria-label="Reference above"
                    title="Above"
                    className={half(
                      (scriptureTemplate.referencePosition ?? "below") === "above",
                      true,
                    )}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setScriptureTemplate({ referencePosition: "below" })}
                    aria-label="Reference below"
                    title="Below"
                    className={half(
                      (scriptureTemplate.referencePosition ?? "below") === "below",
                      false,
                    )}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex-1">
                <div className={`${LABEL} mb-2`}>Alignment</div>
                <div className="mono flex overflow-hidden rounded-full border border-foreground/40">
                  <button
                    type="button"
                    onClick={() => setScriptureTemplate({ align: "left" })}
                    aria-label="Left"
                    title="Left"
                    className={half((scriptureTemplate.align ?? "left") === "left", true)}
                  >
                    L
                  </button>
                  <button
                    type="button"
                    onClick={() => setScriptureTemplate({ align: "center" })}
                    aria-label="Centre"
                    title="Centre"
                    className={half(scriptureTemplate.align === "center", false)}
                  >
                    C
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {isSong && (
        <div className="grid grid-cols-2 gap-x-4">
          <div>
            <div className={`${LABEL} mb-2`}>Case</div>
            <div className="flex gap-1">
              {(
                [
                  ["upper", "All Caps"],
                  ["mixed", "Mixed"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSongTemplate({ textCase: v })}
                  className={`${PILL} flex-1 ${(songTemplate.textCase ?? "mixed") === v ? on : off}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
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

/** Back to current slide: a plain reset icon. */
function BackToCurrent({
  hidden,
  onClick,
  floating = false,
}: {
  hidden: boolean;
  onClick: () => void;
  /** Over the Slides list: on the page colour so it reads over slides. */
  floating?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Back to current slide"
      aria-label="Back to current slide"
      className={`flex h-8 w-8 items-center justify-center rounded-full transition-opacity duration-200 hover:bg-foreground/15 active:bg-foreground/15 ${
        floating ? "bg-background" : ""
      } ${hidden ? "pointer-events-none opacity-0" : "opacity-100"}`}
      tabIndex={hidden ? -1 : 0}
    >
      <RotateCcw className="h-4 w-4" />
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
                          <div key={`${slide.id}@${i}`} data-run={i}>
                            <Thumb
                              set={d}
                              slideIndex={d.slides.indexOf(slide)}
                              isLive={i === liveAt}
                              onClick={() => go(p ?? null)}
                              label={`${d.name}, slide ${d.slides.indexOf(slide) + 1}`}
                              className="w-full"
                            />
                          </div>
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
          <BackToCurrent floating hidden={liveInView} onClick={() => scrollToItem(liveAt, true)} />
        </div>
      </div>
    </div>
  );
}
