import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  useLibrary,
  useLive,
  useSongTemplateDraft,
  useScriptureTemplateDraft,
  useHiddenSections,
  isVideoPlaying,
  startLiveHeartbeat,
  loadGatheringHiddenSections,
} from "@/lib/store";
import { useIsSignedIn } from "@/lib/authStore";
import { useTheme } from "@/hooks/use-theme";
import { APP_NAME } from "@/lib/appConfig";
import { isLiveNow } from "@/lib/live-session";
import { SlideView, DissolveSlide } from "@/components/SlideView";
import { ScrollingName } from "@/components/ScrollingName";
import { MediaTemplateEditor } from "@/components/MediaTemplateEditor";
import { SongTemplateEditor } from "@/components/SongTemplateEditor";
import { ScriptureTemplateEditor } from "@/components/ScriptureTemplateEditor";
import { ShareGatheringDialog } from "@/components/ShareGatheringDialog";
import { useAccountSlug } from "@/hooks/use-account-slug";
import { inferredVersions, versionsMismatchWorkspace, visibleVersions } from "@/lib/versions";
import { VersionWarning } from "@/components/VersionWarning";
import { NumberStepper } from "@/components/NumberStepper";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowUpLeft,
  ArrowUpRight,
  ArrowDownAZ,
  ArrowDownWideNarrow,
  Share2,
  X,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  House,
  Check,
  Eye,
  EyeOff,
  Play,
  Pause,
  RotateCcw,
  Monitor,
  Smartphone,
  Wifi,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  stripChords,
  stripChordsRaw,
  reapplyChords,
  transposeLyrics,
  guessKey,
} from "@/lib/chords";
import { stripInlineFormat } from "@/lib/inline-format";
import { create } from "zustand";
import { groupSlides, hiddenSlideIds } from "@/lib/sections";
import { hideDragGhost } from "@/components/DragBits";
import {
  PhoneViewer,
  ViewerSettings,
  loadPrefs,
  phoneSetHasChords,
  type PhoneSet,
  type ViewerPrefs,
} from "@/components/PhoneViewer";
import { Switch } from "@/components/ui/switch";
import type { Set as PhytoSet, SetKind, Slide } from "@/lib/types";
import { z } from "zod";

type LiveApi = ReturnType<typeof useLive.getState>;

function kindBadgeBg(kind: SetKind): string {
  if (kind === "song") return "bg-[var(--brand-blue)] text-[var(--brand-white)]";
  if (kind === "scripture") return "bg-[var(--brand-green)] text-[var(--brand-white)]";
  if (kind === "message") return "bg-[var(--brand-green-dark)] text-[var(--brand-white)]";
  if (kind === "media") return "bg-[var(--brand-orange)] text-[var(--brand-white)]";
  return "bg-muted text-foreground";
}

function kindHoverBg(kind: SetKind): string {
  if (kind === "song") return "hover:bg-[var(--brand-blue)]/20";
  if (kind === "scripture") return "hover:bg-[var(--brand-green)]/20";
  if (kind === "message") return "hover:bg-[var(--brand-green-dark)]/20";
  if (kind === "media") return "hover:bg-[var(--brand-orange)]/20";
  return "hover:bg-muted/50";
}

function kindActiveBg(kind: SetKind): string {
  if (kind === "song") return "bg-[var(--brand-blue)]/20";
  if (kind === "scripture") return "bg-[var(--brand-green)]/20";
  if (kind === "message") return "bg-[var(--brand-green-dark)]/20";
  if (kind === "media") return "bg-[var(--brand-orange)]/20";
  return "bg-muted/50";
}

function kindLiveColor(kind: SetKind): string {
  if (kind === "song") return "var(--brand-blue)";
  if (kind === "scripture") return "var(--brand-green)";
  if (kind === "message") return "var(--brand-green-dark)";
  if (kind === "media") return "var(--brand-orange)";
  return "var(--brand-red)";
}

const KIND_ABBREV: Record<SetKind, string> = {
  song: "SO",
  scripture: "SC",
  media: "ME",
  mixed: "MX",
  message: "MSG",
};

function KindBadge({ kind, abbrev = false }: { kind: SetKind; abbrev?: boolean }) {
  return (
    <span
      className={`pill mono px-2 py-0.5 text-[10px] uppercase tracking-wider ${kindBadgeBg(kind)}`}
    >
      {abbrev ? KIND_ABBREV[kind] : kind === "mixed" ? "Mixed" : kind}
    </span>
  );
}

/** A small colour-coded dot standing in for the set category (used in the
 *  presenter lists instead of the abbreviated text badge). */
function KindDot({ kind }: { kind: SetKind }) {
  return (
    <span
      className="h-3 w-3 shrink-0 rounded-full"
      style={{ backgroundColor: kindLiveColor(kind) }}
      title={kind === "mixed" ? "Mixed" : kind}
      aria-label={kind}
    />
  );
}

/** Lyric search, matched against the text as projected — inline chords like
 *  `(G)` are stripped first so they can't break a phrase mid-search. */
function setMatchesLyric(s: PhytoSet, q: string): boolean {
  return s.slides.some((slide) =>
    slide.lines?.some((line) => stripInlineFormat(stripChords(line)).toLowerCase().includes(q)),
  );
}

const searchSchema = z.object({
  set: z.string().optional(),
  gathering: z.string().optional(),
  /** Which presenter view to open in. Round-trips through the set editor so
   *  going back from an edit lands on the mobile preview, not slides. */
  view: z.enum(["slides", "mobile"]).optional(),
});

/** The sidebar's colour dot for a set, or a warning triangle in its place when
 *  the set's bible versions sit outside the workspace's languages. */
function KindDotOrWarning({ set }: { set: PhytoSet }) {
  const settings = useLibrary((s) => s.workspaceSettings);
  const hasVerses = set.slides.some((sl) => sl.kind === "scripture");
  if (hasVerses && versionsMismatchWorkspace(inferredVersions(set), settings)) {
    return <VersionWarning set={set} silent />;
  }
  return <KindDot kind={set.kind} />;
}

export const Route = createFileRoute("/present")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: `Presenter | ${APP_NAME}` }, { name: "robots", content: "noindex" }],
  }),
  component: Presenter,
});

// Presenter catalogue kind filter, kept in a session store so it survives moving
// into and out of a gathering (which re-renders the presenter) instead of
// resetting to "all" each time.
type PresenterKind = "all" | "song" | "scripture" | "media";
const usePresenterKindFilter = create<{ kind: PresenterKind; setKind: (k: PresenterKind) => void }>(
  (set) => ({ kind: "all", setKind: (kind) => set({ kind }) }),
);

function Presenter() {
  const { set: setFromUrl, gathering: gatheringFromUrl, view: viewFromUrl } = Route.useSearch();
  const sets = useLibrary((s) => s.sets);
  // Which bible versions a scripture projects follows the workspace settings.
  const workspaceSettings = useLibrary((s) => s.workspaceSettings);
  const order = useLibrary((s) => s.order);
  const gatherings = useLibrary((s) => s.gatherings);
  const gatheringOrder = useLibrary((s) => s.gatheringOrder);
  const addSetToGathering = useLibrary((s) => s.addSetToGathering);
  const removeSetFromGathering = useLibrary((s) => s.removeSetFromGathering);
  const reorderGatheringSets = useLibrary((s) => s.reorderGatheringSets);
  const renameGathering = useLibrary((s) => s.renameGathering);
  const createSet = useLibrary((s) => s.createSet);
  const createGathering = useLibrary((s) => s.createGathering);
  const pushHiddenSections = useLibrary((s) => s.pushHiddenSections);
  const updateSet = useLibrary((s) => s.updateSet);
  const goLive = useLibrary((s) => s.goLive);
  const endSession = useLibrary((s) => s.endSession);
  const deleteGathering = useLibrary((s) => s.deleteGathering);
  const navigate = useNavigate();
  const live = useLive();
  const songTemplate = useLibrary((s) => s.songTemplate);
  const songDraft = useSongTemplateDraft((s) => s.draft);
  const effectiveSongTemplate = songDraft ?? songTemplate;
  const scriptureTemplate = useLibrary((s) => s.scriptureTemplate);
  const scriptureDraft = useScriptureTemplateDraft((s) => s.draft);
  const effectiveScriptureTemplate = scriptureDraft ?? scriptureTemplate;
  const fadeMs = useLibrary((s) => s.fadeMs);
  const setFadeMs = useLibrary((s) => s.setFadeMs);

  // The presenter is the sender: it keeps re-stating what's live so an /output
  // window that was throttled or frozen in the background — the normal state of
  // a tab being cast — can't sit on a stale slide indefinitely.
  useEffect(() => startLiveHeartbeat(), []);

  // Seed this gathering's saved section-hiding when it opens, so hides persist
  // per gathering across sessions/devices (not just in this tab).
  useEffect(() => {
    if (gatheringFromUrl) loadGatheringHiddenSections(gatheringFromUrl);
  }, [gatheringFromUrl]);

  const activeGathering = gatheringFromUrl ? gatherings[gatheringFromUrl] : null;

  const setList = activeGathering ? activeGathering.setIds.filter((id) => sets[id]) : order;

  const [activeSetId, setActiveSetId] = useState<string | null>(
    setFromUrl ?? (live.setId && sets[live.setId] ? live.setId : null) ?? setList[0] ?? null,
  );

  // Where the set editor returns to. Always carries the edited set so we land
  // back on it: in a gathering that's `gathering` + `set` (+ `view=mobile` when
  // previewing the phone), otherwise just `set`.
  const presenterReturn = (setId: string) => {
    const params = new URLSearchParams();
    if (gatheringFromUrl) {
      params.set("gathering", gatheringFromUrl);
      params.set("set", setId);
      if (viewMode === "mobile") params.set("view", "mobile");
    } else {
      params.set("set", setId);
    }
    return `/present?${params.toString()}`;
  };
  const [query, setQuery] = useState("");
  const [setSortMode, setSetSortMode] = useState<"az" | "newest">("az");
  // Catalogue kind filter (presenter, non-gathering list): coloured dots that
  // narrow to song / scripture / media, like the home catalogue chips. Scripture
  // includes messages, matching the home page.
  const kindFilter = usePresenterKindFilter((s) => s.kind);
  const setKindFilter = usePresenterKindFilter((s) => s.setKind);
  // Reset the catalogue kind filter to "all" whenever you switch view (into a
  // gathering, back to the general list, or between gatherings), so a filter set
  // in one view never carries over to the next.
  useEffect(() => {
    setKindFilter("all");
  }, [gatheringFromUrl, setKindFilter]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // "slides" = the operator grid + output preview (default). "mobile" = a
  // preview of what congregants see on their phones, replacing the slide grid
  // and right rail.
  const [viewMode, setViewMode] = useState<"slides" | "mobile">(
    viewFromUrl === "mobile" ? "mobile" : "slides",
  );
  // Display prefs for the mobile preview, driven by the settings panel beside
  // it (and shared with the preview so changes show live).
  const [phonePrefs, setPhonePrefs] = useState<ViewerPrefs>(() => loadPrefs());
  const { mode: themeMode } = useTheme();
  const [slideW, setSlideW] = useState(() => {
    if (typeof window === "undefined") return 256;
    const saved = localStorage.getItem("presenter-slide-w");
    return saved ? Number(saved) : 256;
  });
  const [dragOverGathering, setDragOverGathering] = useState<string | null>(null);
  const [reorderDragUiIndex, setReorderDragUiIndex] = useState<number | null>(null);
  // Reorder slots carry a STABLE key so a row keeps its identity as the list
  // reorders under the cursor. Keying by `${id}-${index}` remounted the dragged
  // element the moment it moved, which killed the native drag (no dragend fired,
  // so the row stayed greyed and nothing committed).
  const [reorderLiveOrder, setReorderLiveOrder] = useState<{ key: string; id: string }[] | null>(
    null,
  );
  const reorderLiveRef = useRef<{ key: string; id: string }[] | null>(null);
  const reorderDragIndex = useRef<number | null>(null);
  const [editingGatheringName, setEditingGatheringName] = useState(false);
  const gatheringNameInputRef = useRef<HTMLInputElement>(null);

  // Per-tab section hiding, used while running a gathering. Keyed by set id;
  // values are the stable section keys (label + occurrence) of hidden groups.
  // Persisted in sessionStorage (see store) so it survives leaving the presenter
  // to edit a set or go home, and clears only when the tab closes. Using the
  // stable key (not the slide id) is what keeps a section hidden after the set
  // is edited, since editing regenerates every slide id. `manageSet` is the set
  // whose sections are currently being toggled (eye icon clicked).
  const hiddenBySet = useHiddenSections((s) => s.hiddenBySet);
  const setHidden = useHiddenSections((s) => s.setHidden);
  const [manageSet, setManageSet] = useState<string | null>(null);
  // Cursor-following warning shown when the user tries to hide the last
  // remaining visible section. Auto-clears 3s after the blocked click.
  const [hideWarning, setHideWarning] = useState<{ x: number; y: number } | null>(null);
  const hideWarningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleSection = (setId: string, sectionKey: string, clientX: number, clientY: number) => {
    const cur = hiddenBySet[setId] ?? [];
    const alreadyHidden = cur.includes(sectionKey);
    // Hiding (not un-hiding) the last visible section is not allowed. Count
    // against the set's *current* groups so stale keys (from a prior edit) don't
    // skew the math.
    if (!alreadyHidden) {
      const groups = sets[setId] ? groupSlides(sets[setId].slides) : [];
      const hiddenNow = new Set(cur);
      const visible = groups.filter((g) => !hiddenNow.has(g.key)).length;
      if (visible <= 1) {
        if (hideWarningTimer.current) clearTimeout(hideWarningTimer.current);
        setHideWarning({ x: clientX, y: clientY });
        hideWarningTimer.current = setTimeout(() => setHideWarning(null), 3000);
        return;
      }
    }
    const next = alreadyHidden ? cur.filter((k) => k !== sectionKey) : [...cur, sectionKey];
    setHidden(setId, next);
    // Mirror the change to the shared gathering so congregants' phones drop the
    // same sections. Only meaningful inside a live gathering; harmless otherwise.
    if (activeGathering) {
      pushHiddenSections(activeGathering.id, { ...hiddenBySet, [setId]: next });
    }
  };

  // While the warning is showing, let it follow the cursor.
  useEffect(() => {
    if (!hideWarning) return;
    const onMove = (e: MouseEvent) =>
      setHideWarning((w) => (w ? { x: e.clientX, y: e.clientY } : w));
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [!!hideWarning]);

  const isSignedIn = useIsSignedIn();
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showGoLiveDialog, setShowGoLiveDialog] = useState(false);
  const [showEndSessionDialog, setShowEndSessionDialog] = useState(false);
  const [showDeleteGatheringDialog, setShowDeleteGatheringDialog] = useState(false);
  const [isGoingLive, setIsGoingLive] = useState(false);
  const activeShareToken = activeGathering?.share_token ?? null;
  // Persistent per-account/per-group share URL (follows go-live). Provisioned/
  // loaded when the dialog opens; falls back to the gathering token otherwise.
  const share = useAccountSlug({
    scope: { groupId: activeGathering?.group_id ?? null },
    seed: activeShareToken ?? "",
    enabled: showShareDialog,
  });
  const shareUrl = share.slug ? `${window.location.origin}/g/${share.slug}` : "";

  useEffect(() => {
    if (setFromUrl) setActiveSetId(setFromUrl);
  }, [setFromUrl]);

  // Returning from the set editor into a gathering in slides mode: scroll that
  // set's section into view so we land where the set lives. (Mobile follows the
  // set via the preview's active tab, so no scroll needed there.) Mount-only —
  // this is the arrival, not every later selection.
  useEffect(() => {
    if (!setFromUrl || !gatheringFromUrl || viewFromUrl === "mobile") return;
    const t = setTimeout(() => {
      document
        .getElementById(`set-section-${setFromUrl}`)
        ?.scrollIntoView({ behavior: "auto", block: "start" });
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (activeGathering && !activeSetId) {
      setActiveSetId(activeGathering.setIds[0] ?? null);
    }
  }, [activeGathering, activeSetId]);

  // Auto-follow the live set when it changes mid-presentation, but skip the
  // initial mount so an explicit ?set= (e.g. returning from the set editor) is
  // not overridden by whatever set happens to be live.
  const didMountLiveFollow = useRef(false);
  useEffect(() => {
    if (!didMountLiveFollow.current) {
      didMountLiveFollow.current = true;
      return;
    }
    if (live.setId && sets[live.setId]) {
      setActiveSetId(live.setId);
    }
  }, [live.setId]);

  useEffect(() => {
    reorderLiveRef.current = null;
    setReorderLiveOrder(null);
    setReorderDragUiIndex(null);
    reorderDragIndex.current = null;
    setManageSet(null);
  }, [activeGathering?.id]);

  const activeSet = activeSetId ? sets[activeSetId] : null;
  const liveSet = live.setId ? sets[live.setId] : null;
  const liveSlide = useMemo(
    () => liveSet?.slides.find((s) => s.id === live.slideId) ?? null,
    [liveSet, live.slideId],
  );

  // Sets feeding the phone preview: the whole gathering (in order) mirrors what
  // congregants get; outside a gathering, just the set being viewed.
  const phonePreviewSets: PhoneSet[] = useMemo(() => {
    const ids = activeGathering ? activeGathering.setIds : activeSetId ? [activeSetId] : [];
    return ids
      .map((id) => sets[id])
      .filter((d): d is PhytoSet => !!d)
      .map((d) => ({
        id: d.id,
        title: d.name,
        type: d.kind,
        slides: d.slides,
        chords: d.chords,
        versions: visibleVersions(d, workspaceSettings),
      }));
  }, [activeGathering, activeSetId, sets, workspaceSettings]);

  // Mobile preview only makes sense for a gathering (it's the multi-set phone
  // view). Viewing a single set falls back to slides, and the toggle is hidden.
  const effectiveViewMode = activeGathering ? viewMode : "slides";

  // In the mobile preview, changing a song's key or letters/numbers writes back
  // to the actual set — mirroring the set editor: a key change transposes the
  // stored lyrics too, so the set's chords.key stays the truth about what's
  // written. Everyone (projection, phones, editor) then sees the new key.
  const handlePreviewChordChange = (
    setId: string,
    patch: { key?: string; display?: "letters" | "numbers" },
  ) => {
    const d = sets[setId];
    if (!d) return;
    const joined = d.slides.flatMap((sl) => sl.lines ?? []).join("\n");
    const chords = d.chords ?? { key: guessKey(joined) ?? "G", display: "letters" as const };
    if (patch.display && patch.display !== chords.display) {
      updateSet(setId, { chords: { ...chords, display: patch.display } });
    }
    if (patch.key && patch.key !== chords.key) {
      const from = chords.key;
      const to = patch.key;
      const slides = d.slides.map((sl) =>
        sl.lines ? { ...sl, lines: sl.lines.map((l) => transposeLyrics(l, from, to)) } : sl,
      );
      updateSet(setId, { slides, chords: { ...chords, key: to } });
    }
  };

  const q = query.trim().toLowerCase();
  const showAll = !activeGathering;
  const filteredSets = setList
    .filter((id) => {
      // Kind filter applies only to the catalogue list, never inside a gathering
      // (whose order and contents are fixed). Scripture includes messages.
      if (activeGathering || kindFilter === "all") return true;
      const s = sets[id];
      if (!s) return false;
      return kindFilter === "scripture"
        ? s.kind === "scripture" || s.kind === "message"
        : s.kind === kindFilter;
    })
    .filter((id) => {
      if (!q) return true;
      const s = sets[id];
      if (!s) return false;
      if (s.name.toLowerCase().includes(q)) return true;
      return setMatchesLyric(s, q);
    })
    // Only the catalogue list is sorted; inside a gathering the order is
    // manual (drag-reorderable) and must be left untouched.
    .sort((a, b) => {
      if (activeGathering) return 0;
      const sa = sets[a];
      const sb = sets[b];
      if (!sa || !sb) return 0;
      return setSortMode === "az" ? sa.name.localeCompare(sb.name) : sb.createdAt - sa.createdAt;
    });
  const filteredGatherings = showAll ? gatheringOrder : [];

  // Coloured kind-filter dots (song / scripture / media), reused in the Sets
  // header and the in-gathering Catalogue search header. Tight cluster; each dot
  // has a padded hit area. Clicking the active one clears back to all.
  const kindFilterDots = (
    <span className="flex items-center">
      {(
        [
          ["song", "var(--brand-blue)"],
          ["scripture", "var(--brand-green)"],
          ["media", "var(--brand-orange)"],
        ] as const
      ).map(([k, color]) => {
        const active = kindFilter === k;
        return (
          <button
            key={k}
            onClick={() => setKindFilter(active ? "all" : k)}
            title={active ? "Show all" : `Show ${k}`}
            aria-label={active ? "Show all" : `Show ${k}`}
            aria-pressed={active}
            className={`flex items-center justify-center rounded-full p-1 transition ${
              kindFilter !== "all" && !active ? "opacity-30" : ""
            }`}
          >
            <span
              className="h-3 w-3 rounded-full border"
              style={{
                backgroundColor: active || kindFilter === "all" ? color : "transparent",
                borderColor: color,
              }}
            />
          </button>
        );
      })}
    </span>
  );

  // Commit the live reorder to the gathering and clear the drag state. Called
  // from both onDrop (fires on the target row) and onDragEnd (fallback); the
  // ref guard makes the second call a no-op.
  const commitReorder = () => {
    if (reorderLiveRef.current && activeGathering) {
      reorderGatheringSets(
        activeGathering.id,
        reorderLiveRef.current.map((s) => s.id),
      );
    }
    reorderLiveRef.current = null;
    setReorderLiveOrder(null);
    setReorderDragUiIndex(null);
    reorderDragIndex.current = null;
  };

  // While inside a gathering, a search also scans the entire catalogue for sets
  // not yet in this gathering, surfaced above the gathering's own sets so they
  // can be inserted on the fly.
  const catalogueResults =
    activeGathering && q
      ? order.filter((id) => {
          if (activeGathering.setIds.includes(id)) return false;
          const s = sets[id];
          if (!s) return false;
          if (kindFilter !== "all") {
            const kindOk =
              kindFilter === "scripture"
                ? s.kind === "scripture" || s.kind === "message"
                : s.kind === kindFilter;
            if (!kindOk) return false;
          }
          if (s.name.toLowerCase().includes(q)) return true;
          return setMatchesLyric(s, q);
        })
      : [];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!liveSet || !liveSlide) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const hidden = hiddenSlideIds(liveSet.slides, hiddenBySet[liveSet.id] ?? []);
      const idx = liveSet.slides.findIndex((s) => s.id === liveSlide.id);
      const advance = () => {
        let j = idx + 1;
        while (j < liveSet.slides.length && hidden.has(liveSet.slides[j].id)) j++;
        const next = liveSet.slides[j];
        if (next) live.go(liveSet.id, next.id);
      };

      // Video slides intercept Space/→ for playback before advancing:
      //  · not playing (and not finished) → play
      //  · playing + Space → stop (pause); playing + → → next slide
      //  · finished → next slide
      if (liveSlide.kind === "video" && (e.key === " " || e.key === "ArrowRight")) {
        e.preventDefault();
        if (live.videoEnded) {
          advance();
        } else if (isVideoPlaying(live)) {
          if (e.key === " ") live.setVideoPlaying(false);
          else advance();
        } else {
          live.setVideoPlaying(true);
        }
        return;
      }

      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        advance();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        let j = idx - 1;
        while (j >= 0 && hidden.has(liveSet.slides[j].id)) j--;
        const prev = liveSet.slides[j];
        if (prev) live.go(liveSet.id, prev.id);
      } else if (e.key === "Escape") {
        e.preventDefault();
        live.toggleBlackout();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [liveSet, liveSlide, live, hiddenBySet]);

  const openOutput = () => window.open("/output", "_blank", "noopener,noreferrer");

  // Where the set editor should return to when opened from here.
  const presenterHere = gatheringFromUrl
    ? `/present?gathering=${gatheringFromUrl}`
    : activeSetId
      ? `/present?set=${activeSetId}`
      : "/present";

  // Mirror the home page's "New" — create the set and open its editor. The
  // editor's Back returns here (and, because redirectTo is /present, it hides
  // its own Present button).
  const newSet = (kind: SetKind) => {
    const id = createSet({
      name: kind === "song" ? "New Song" : kind === "scripture" ? "New Scripture" : "New Media",
      kind,
      slides: [],
    });
    navigate({ to: "/set/$setId", params: { setId: id }, search: { redirectTo: presenterHere } });
  };

  // Create a fresh, empty gathering (named with today's date, like home) and
  // drop straight into it. The name can be changed from the top bar.
  const newGathering = () => {
    const today = new Date().toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
    });
    const id = createGathering(today);
    navigate({ to: "/present", search: { gathering: id } });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-foreground bg-background">
        <div className="relative flex items-center justify-between gap-4 px-6 py-4">
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/"
              className="pill flex h-10 w-10 items-center justify-center bg-foreground text-background transition hover:opacity-90"
              title="Home"
              aria-label="Home"
            >
              <House className="h-5 w-5" />
            </Link>
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="rounded-full p-2 transition hover:bg-muted"
              title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
              aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-5 w-5" />
              ) : (
                <PanelLeftOpen className="h-5 w-5" />
              )}
            </button>
            {/* Slides / Mobile view toggle — grouped with the sidebar toggle as
                a "how the main area is shown" control. Only inside a gathering. */}
            {activeGathering && (
              <div className="flex items-center gap-2 pl-1">
                <Monitor
                  className={`h-4 w-4 ${viewMode === "slides" ? "" : "text-muted-foreground"}`}
                />
                <Switch
                  checked={viewMode === "mobile"}
                  onCheckedChange={(on) => setViewMode(on ? "mobile" : "slides")}
                  aria-label="Toggle mobile preview"
                />
                <Smartphone
                  className={`h-4 w-4 ${viewMode === "mobile" ? "" : "text-muted-foreground"}`}
                />
              </div>
            )}
          </div>

          <div className="pointer-events-none absolute left-1/2 flex max-w-[50%] -translate-x-1/2 items-center justify-center gap-3">
            {activeGathering ? (
              <>
                {editingGatheringName ? (
                  <>
                    <input
                      ref={gatheringNameInputRef}
                      defaultValue={activeGathering.name}
                      className="pointer-events-auto h-10 w-48 rounded-full border border-foreground bg-transparent px-4 text-base font-normal outline-none"
                      style={{ letterSpacing: "-0.045em" }}
                      onBlur={(e) => {
                        renameGathering(activeGathering.id, e.target.value || activeGathering.name);
                        setEditingGatheringName(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          renameGathering(
                            activeGathering.id,
                            e.currentTarget.value || activeGathering.name,
                          );
                          setEditingGatheringName(false);
                        }
                        if (e.key === "Escape") setEditingGatheringName(false);
                      }}
                    />
                    {/* Done — commit the rename and close edit. preventDefault on
                        mousedown keeps the input from blurring first: a blur would
                        re-render this control back to the pencil at the same spot,
                        and the click would land on it and re-open edit. */}
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        renameGathering(
                          activeGathering.id,
                          gatheringNameInputRef.current?.value || activeGathering.name,
                        );
                        setEditingGatheringName(false);
                      }}
                      className="pill mono uppercase pointer-events-auto flex h-10 shrink-0 items-center bg-foreground px-4 text-xs tracking-wider text-background transition hover:opacity-90"
                      title="Done editing"
                      aria-label="Done editing"
                    >
                      Done
                    </button>
                    {/* Reveal delete while renaming — same flow as the home page.
                        Only the owner may delete a group gathering. */}
                    {!activeGathering.shared && (
                      <button
                        // Keep the rename input focused (don't blur-commit) when
                        // opening the delete dialog.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setShowDeleteGatheringDialog(true)}
                        className="pill pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center transition hover:bg-[var(--brand-red)] hover:text-[var(--brand-white)]"
                        title="Delete gathering"
                        aria-label="Delete gathering"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <span
                      className="pointer-events-auto min-w-0 truncate cursor-text text-3xl font-normal"
                      style={{ letterSpacing: "-0.045em", paddingRight: "0.1em" }}
                      onClick={() => {
                        setEditingGatheringName(true);
                        setTimeout(() => gatheringNameInputRef.current?.select(), 0);
                      }}
                      title="Click to rename"
                    >
                      {activeGathering.name}
                    </span>
                    <button
                      onClick={() => {
                        setEditingGatheringName(true);
                        setTimeout(() => gatheringNameInputRef.current?.select(), 0);
                      }}
                      className="pill pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center border border-foreground transition hover:bg-foreground hover:text-background"
                      title="Rename gathering"
                      aria-label="Rename gathering"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </>
                )}
              </>
            ) : activeSet ? (
              /* Standalone set (not in a gathering): its name + category + edit
                 live in the top-bar centre, where the gathering name would sit. */
              <>
                <span
                  className="pointer-events-auto min-w-0 truncate text-3xl font-normal"
                  style={{ letterSpacing: "-0.045em", paddingRight: "0.1em" }}
                >
                  {activeSet.name}
                </span>
                <KindBadge kind={activeSet.kind} />
                <VersionWarning set={activeSet} className="pointer-events-auto" />
                <Link
                  to="/set/$setId"
                  params={{ setId: activeSet.id }}
                  search={{ redirectTo: presenterReturn(activeSet.id) }}
                  className="pill pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center border border-foreground transition hover:bg-foreground hover:text-background"
                  title="Edit set"
                  aria-label="Edit set"
                >
                  <Pencil className="h-4 w-4" />
                </Link>
              </>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* Slide-size slider — slides mode only, just left of Output. */}
            {effectiveViewMode === "slides" && (
              <input
                type="range"
                min={160}
                max={400}
                step={8}
                value={slideW}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setSlideW(v);
                  localStorage.setItem("presenter-slide-w", String(v));
                }}
                style={{ width: 96 }}
                className="mr-3"
                title="Slide size"
                aria-label="Slide size"
              />
            )}
            {/* Share — mobile mode only. */}
            {effectiveViewMode === "mobile" && isSignedIn && activeShareToken && (
              <button
                onClick={() => setShowShareDialog(true)}
                className="pill flex h-10 w-10 items-center justify-center border border-foreground transition hover:bg-foreground hover:text-background"
                title="Share gathering"
                aria-label="Share gathering"
              >
                <Share2 className="h-4 w-4" />
              </button>
            )}
            {/* Go live / End session — mobile mode only, right of Share. */}
            {effectiveViewMode === "mobile" &&
              isSignedIn &&
              activeGathering &&
              (isLiveNow(activeGathering) ? (
                <button
                  onClick={() => setShowEndSessionDialog(true)}
                  className="pill flex h-10 w-10 items-center justify-center bg-[var(--brand-red)] text-[var(--brand-white)] transition animate-pulse hover:animate-none [&>svg]:opacity-0 [&>svg]:transition-opacity [&>svg]:duration-200 hover:[&>svg]:opacity-100"
                  title="End session"
                  aria-label="End session"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={() => setShowGoLiveDialog(true)}
                  className="pill flex h-10 w-10 items-center justify-center border border-foreground transition hover:border-[var(--brand-red)] hover:bg-[var(--brand-red)] hover:text-[var(--brand-white)]"
                  title="Go live"
                  aria-label="Go live"
                >
                  <Wifi className="h-4 w-4" />
                </button>
              ))}
            {/* Output — slides mode only. */}
            {effectiveViewMode === "slides" && (
              <button
                onClick={openOutput}
                className="pill mono uppercase flex h-10 items-center gap-2 border border-foreground px-5 text-sm transition hover:bg-foreground hover:text-background"
                title="Output window"
              >
                Output <ArrowUpRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      <div
        className={`grid flex-1 gap-0 ${
          effectiveViewMode === "mobile"
            ? sidebarOpen
              ? "md:grid-cols-[240px_1fr]"
              : "md:grid-cols-[1fr]"
            : sidebarOpen
              ? "md:grid-cols-[240px_1fr_320px]"
              : "md:grid-cols-[1fr_320px]"
        }`}
      >
        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="flex h-[calc(100vh-73px)] flex-col border-r border-foreground bg-background p-4 md:sticky md:top-[73px]">
            <div className="pill mb-2 flex items-center gap-2 border border-foreground bg-background px-4 py-2">
              <Search className="h-4 w-4 shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for a set"
                className="mono uppercase w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="shrink-0 rounded-full p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* New — full-width pill under the search, matching the home screen. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="pill mono uppercase mb-4 flex w-full items-center justify-center gap-2 bg-foreground px-4 py-2 text-xs tracking-wider text-background transition hover:opacity-90">
                  <Plus className="h-4 w-4" /> New
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-[var(--radix-dropdown-menu-trigger-width)]"
              >
                <DropdownMenuItem
                  onClick={() => newSet("song")}
                  className="mono uppercase justify-center text-xs tracking-wider focus:bg-[var(--brand-blue)] focus:text-[var(--brand-white)]"
                >
                  New Song
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => newSet("scripture")}
                  className="mono uppercase justify-center text-xs tracking-wider focus:bg-[var(--brand-green)] focus:text-[var(--brand-white)]"
                >
                  New Scripture
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => newSet("media")}
                  className="mono uppercase justify-center text-xs tracking-wider focus:bg-[var(--brand-orange)] focus:text-[var(--brand-white)]"
                >
                  New Media
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={newGathering}
                  className="mono uppercase justify-center text-xs tracking-wider focus:bg-foreground focus:text-background"
                >
                  New Gathering
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="catalogue-scroll flex-1 overflow-auto pr-1">
              {showAll && filteredGatherings.length > 0 && (
                <div className="mb-5">
                  <div className="mono mb-2 px-1 text-[10px] uppercase tracking-wider">
                    Gatherings
                  </div>
                  <div className="space-y-1">
                    {filteredGatherings.map((pid) => {
                      const p = gatherings[pid];
                      if (!p) return null;
                      const isDragOver = dragOverGathering === pid;
                      return (
                        <Link
                          key={pid}
                          to="/present"
                          search={{ gathering: pid }}
                          onDragOver={(e) => {
                            if (e.dataTransfer.types.includes("application/x-set-id")) {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "copy";
                              if (dragOverGathering !== pid) setDragOverGathering(pid);
                            }
                          }}
                          onDragLeave={() => {
                            if (dragOverGathering === pid) setDragOverGathering(null);
                          }}
                          onDrop={(e) => {
                            const setId = e.dataTransfer.getData("application/x-set-id");
                            setDragOverGathering(null);
                            if (!setId) return;
                            e.preventDefault();
                            if (!p.setIds.includes(setId)) addSetToGathering(pid, setId);
                          }}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-muted ${
                            isDragOver ? "bg-foreground/10 ring-1 ring-foreground" : ""
                          }`}
                        >
                          <span className="truncate">{p.name}</span>
                          {isLiveNow(p) && pid !== gatheringFromUrl && (
                            <span
                              className="h-3 w-3 shrink-0 rounded-full bg-[var(--brand-red)]"
                              title="Live"
                            />
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeGathering && q && (
                <div className="mb-2">
                  <div className="mono mb-2 flex items-center justify-between px-1 text-[10px] uppercase tracking-wider">
                    <span>Catalogue</span>
                    {kindFilterDots}
                  </div>
                  {catalogueResults.length === 0 && (
                    <p className="mono mb-4 px-2 text-[10px] uppercase text-muted-foreground">
                      No sets in your catalogue match
                    </p>
                  )}
                  <div className="space-y-1">
                    {catalogueResults.map((id) => {
                      const d = sets[id];
                      if (!d) return null;
                      return (
                        <button
                          key={id}
                          onClick={() => {
                            addSetToGathering(activeGathering.id, id);
                            setQuery("");
                          }}
                          className={`group flex w-full items-center justify-between gap-2 rounded-lg border-2 border-transparent px-2 py-1.5 text-left text-sm transition ${kindHoverBg(d.kind)}`}
                          title="Add to gathering"
                        >
                          <span className="truncate">{d.name}</span>
                          <span className="flex items-center gap-1">
                            <KindDotOrWarning set={d} />
                            <Plus className="h-4 w-4 opacity-40 group-hover:opacity-100" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <div className="mono mb-2 px-1 text-[10px] uppercase tracking-wider">
                  {activeGathering ? (
                    <span className="inline-flex items-center gap-2">
                      <Link to="/present" title="Back to all" aria-label="Back to all">
                        <ArrowUpLeft className="h-3.5 w-3.5" />
                      </Link>
                      {activeGathering.name}
                    </span>
                  ) : (
                    <span className="flex items-center justify-between">
                      <span>Catalogue</span>
                      <span className="flex items-center gap-1">
                        {kindFilterDots}
                        <button
                          onClick={() => setSetSortMode(setSortMode === "az" ? "newest" : "az")}
                          title={`Sort: ${setSortMode === "az" ? "A → Z" : "Newest first"}`}
                          aria-label={`Sort: ${setSortMode === "az" ? "A → Z" : "Newest first"}`}
                          className="flex items-center"
                        >
                          {setSortMode === "az" ? (
                            <ArrowDownAZ className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDownWideNarrow className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </span>
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {filteredSets.length === 0 && (
                    <p className="mono uppercase px-2 text-[10px] text-muted-foreground">
                      {activeGathering
                        ? q
                          ? "No sets in this gathering match"
                          : "Gathering is empty. Search above to add a set"
                        : q
                          ? "No matches"
                          : "No sets yet"}
                    </p>
                  )}
                  {(
                    reorderLiveOrder ??
                    filteredSets.map((sid, si) => ({ key: `${sid}#${si}`, id: sid }))
                  ).map((slot, i) => {
                    const id = slot.id;
                    const d = sets[id];
                    if (!d) return null;
                    const isActive = id === activeSetId;
                    // The blue "live" outline is a slides-mode cue; the mobile
                    // preview has its own current-tab indication, so suppress it
                    // there.
                    const isLive = id === live.setId && effectiveViewMode !== "mobile";
                    const inGathering = !!activeGathering;
                    // Identify rows by POSITION, not set id: a set can recur in a
                    // gathering, so id-based reorder would move the wrong copy.
                    const isDragging = inGathering && i === reorderDragUiIndex;
                    return (
                      <button
                        key={slot.key}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("application/x-set-id", id);
                          e.dataTransfer.effectAllowed = inGathering ? "move" : "copy";
                          if (inGathering) {
                            // Hide the native drag image so there's no ghost that
                            // snaps back to the origin on drop — the live-reordering
                            // rows are the only feedback we want.
                            hideDragGhost(e);
                            setReorderDragUiIndex(i);
                            reorderDragIndex.current = i;
                          }
                        }}
                        onDragOver={(e) => {
                          const from = reorderDragIndex.current;
                          if (!inGathering || from === null) return;
                          // Always allow the drop (preventDefault on every row,
                          // even the one being hovered) so onDrop fires instantly
                          // instead of waiting on the delayed dragend.
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          if (from === i) return;
                          const current =
                            reorderLiveOrder ??
                            filteredSets.map((sid, si) => ({ key: `${sid}#${si}`, id: sid }));
                          const next = [...current];
                          const [moved] = next.splice(from, 1);
                          next.splice(i, 0, moved);
                          reorderDragIndex.current = i;
                          setReorderDragUiIndex(i);
                          reorderLiveRef.current = next;
                          setReorderLiveOrder(next);
                        }}
                        onDrop={(e) => {
                          if (!inGathering) return;
                          e.preventDefault();
                          commitReorder();
                        }}
                        onDragEnd={commitReorder}
                        onClick={() => {
                          setActiveSetId(id);
                          if (activeGathering) {
                            const el = document.getElementById(`set-section-${id}`);
                            el?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg border-2 px-2 py-1.5 text-left text-sm transition ${
                          isDragging ? "opacity-50" : ""
                        } ${
                          isLive
                            ? ""
                            : isActive
                              ? `border-transparent ${kindActiveBg(d.kind)}`
                              : `border-transparent ${kindHoverBg(d.kind)}`
                        }`}
                        style={isLive ? { borderColor: kindLiveColor(d.kind) } : undefined}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-1">
                          {inGathering && (
                            <span className="mono mr-1 shrink-0 text-[10px] text-muted-foreground">
                              {i + 1}.
                            </span>
                          )}
                          <ScrollingName text={d.name} className="min-w-0 flex-1" />
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <KindDotOrWarning set={d} />
                          {inGathering && activeGathering && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                removeSetFromGathering(activeGathering.id, i);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.stopPropagation();
                                  removeSetFromGathering(activeGathering.id, i);
                                }
                              }}
                              className="rounded-full p-0.5 text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground hover:opacity-100"
                              title="Remove from gathering"
                            >
                              <X className="h-3 w-3" />
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* Main */}
        <main
          className={`p-6 ${
            effectiveViewMode === "mobile"
              ? "h-[calc(100vh-73px)] overflow-hidden"
              : "overflow-auto"
          }`}
        >
          {effectiveViewMode === "mobile" ? (
            <div className="relative h-full">
              {phonePreviewSets.length === 0 ? (
                <div className="mono absolute inset-0 flex items-center justify-center text-xs uppercase tracking-wider text-muted-foreground">
                  Gathering is empty. Add a set to preview the phone view.
                </div>
              ) : (
                <>
                  {/* Section visibility gutter — one marker per section of the
                      active song, in order. Absolutely placed to the LEFT of the
                      centered phone so its presence never shifts the phone.
                      Toggling reuses the same hiding as slides mode, so the
                      preview, phones and slides all agree. */}
                  {(activeSet?.kind === "song" ||
                    activeSet?.kind === "scripture" ||
                    activeSet?.kind === "message") &&
                    (() => {
                      const groups = groupSlides(activeSet.slides);
                      // No visibility toggles with a single section: hiding the
                      // only section is disallowed anyway, so the button is moot.
                      if (groups.length <= 1) return null;
                      const hidden = new Set(hiddenBySet[activeSet.id] ?? []);
                      return (
                        <div
                          className="catalogue-scroll absolute top-1/2 flex max-h-full -translate-x-full -translate-y-1/2 flex-col items-end gap-1.5 overflow-auto py-1 pr-4"
                          // Right edge of the gutter sits just left of the phone
                          // (phone is 380px wide, centered → its left edge is at
                          // 50% − 190px).
                          style={{ left: "calc(50% - 190px)" }}
                        >
                          {groups.map((g) => {
                            const isHidden = hidden.has(g.key);
                            const label = g.section ?? "Untitled";
                            return (
                              <button
                                key={g.key}
                                onClick={(e) =>
                                  toggleSection(activeSet.id, g.key, e.clientX, e.clientY)
                                }
                                className={`pill mono flex items-center gap-2 border border-foreground px-3 py-1.5 text-[10px] uppercase tracking-wider transition hover:bg-foreground hover:text-background ${
                                  isHidden ? "opacity-50" : ""
                                }`}
                                title={isHidden ? `Show ${label}` : `Hide ${label}`}
                                aria-pressed={isHidden}
                              >
                                {isHidden ? (
                                  <EyeOff className="h-3.5 w-3.5 shrink-0" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5 shrink-0" />
                                )}
                                <span className="max-w-[9rem] truncate">{label}</span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  <div
                    className="absolute bottom-0 left-1/2 top-0 -translate-x-1/2 overflow-hidden rounded-[2rem] border border-foreground/25 bg-black"
                    style={{ width: 380 }}
                  >
                    <PhoneViewer
                      sets={phonePreviewSets}
                      hiddenBySet={hiddenBySet}
                      embedded
                      showSettings={false}
                      prefs={phonePrefs}
                      onPrefsChange={setPhonePrefs}
                      activeId={activeSetId}
                      onActiveChange={setActiveSetId}
                      onChordChange={handlePreviewChordChange}
                      onEditSet={(id) =>
                        navigate({
                          to: "/set/$setId",
                          params: { setId: id },
                          // Return to this set's tab in the mobile preview.
                          search: { redirectTo: presenterReturn(id) },
                        })
                      }
                    />
                  </div>

                  {/* Display settings — floating to the RIGHT of the centered
                      phone, driving the preview's font/theme/chords live. Chrome
                      follows the editor's own light/dark theme. */}
                  <div
                    className="absolute top-1/2 max-h-full w-52 -translate-y-1/2 overflow-auto pl-6"
                    style={{ left: "calc(50% + 190px)" }}
                  >
                    <ViewerSettings
                      prefs={phonePrefs}
                      setPrefs={setPhonePrefs}
                      hasChords={phonePreviewSets.some(phoneSetHasChords)}
                      dark={themeMode === "dark"}
                    />
                  </div>
                </>
              )}
            </div>
          ) : activeGathering ? (
            setList.length === 0 ? (
              <div className="mono uppercase flex h-full items-center justify-center text-xs tracking-wider text-muted-foreground">
                Gathering is empty. Search the sidebar or drag a set here to add one.
              </div>
            ) : null
          ) : !activeSet ? (
            <div className="mono uppercase flex h-full items-center justify-center text-xs tracking-wider text-muted-foreground">
              Select a set to begin
            </div>
          ) : activeSet.slides.length === 0 ? (
            <div className="mono uppercase flex h-full items-center justify-center gap-2 text-xs tracking-wider text-muted-foreground">
              This set has no slides
              <Link
                to="/set/$setId"
                params={{ setId: activeSet.id }}
                search={{ redirectTo: presenterReturn(activeSet.id) }}
                className="underline"
                title="Edit set"
              >
                <Pencil className="inline h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            /* Title / category / edit now live in the top-bar centre. */
            <SlideGridForPresenter phytoSet={activeSet} live={live} slideW={slideW} />
          )}

          {effectiveViewMode === "slides" && activeGathering && setList.length > 0 && (
            <div className="space-y-8">
              {setList.map((id, i) => {
                const d = sets[id];
                if (!d) return null;
                const sectionGroups = groupSlides(d.slides);
                // Songs, scriptures and messages can hide sections in a gathering.
                // A set with a single section has nothing to hide (hiding the only
                // section is disallowed), so no visibility icon shows.
                const canHide =
                  (d.kind === "song" || d.kind === "scripture" || d.kind === "message") &&
                  sectionGroups.length > 1;
                const hiddenKeys = hiddenBySet[id] ?? [];
                // Count only keys that still match a current section group, so a
                // stale key left over from a prior edit never shows a phantom
                // "hidden" badge.
                const activeHiddenCount = canHide
                  ? (() => {
                      const groupKeys = new Set(sectionGroups.map((g) => g.key));
                      return hiddenKeys.filter((k) => groupKeys.has(k)).length;
                    })()
                  : 0;
                const hasHidden = activeHiddenCount > 0;
                const managing = manageSet === id;
                return (
                  <section key={id} id={`set-section-${id}`}>
                    <div className="mb-2 flex items-center gap-3">
                      <h3 className="text-lg">
                        <span className="mono mr-2 text-sm text-muted-foreground">{i + 1}.</span>
                        {d.name}
                      </h3>
                      <KindBadge kind={d.kind} />
                      <VersionWarning set={d} />
                      <div className="flex items-center gap-1.5">
                        <Link
                          to="/set/$setId"
                          params={{ setId: d.id }}
                          search={{ redirectTo: presenterReturn(d.id) }}
                          className="pill flex h-7 w-7 shrink-0 items-center justify-center border border-foreground transition hover:bg-foreground hover:text-background"
                          title="Edit set"
                          aria-label="Edit set"
                        >
                          <Pencil className="h-3 w-3" />
                        </Link>
                        {canHide && (
                          <button
                            onClick={() => setManageSet((prev) => (prev === id ? null : id))}
                            className={`pill flex h-7 w-7 shrink-0 items-center justify-center border border-foreground transition ${
                              managing
                                ? "bg-foreground text-background"
                                : "hover:bg-foreground hover:text-background"
                            }`}
                            title={
                              managing
                                ? "Done hiding sections"
                                : hasHidden
                                  ? `Sections hidden (${activeHiddenCount}): click to manage`
                                  : "Hide sections"
                            }
                            aria-label={managing ? "Done hiding sections" : "Hide sections"}
                            aria-pressed={managing}
                          >
                            {managing ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : hasHidden ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                      {id === live.setId && (
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: kindLiveColor(d.kind) }}
                          title="Live"
                        />
                      )}
                    </div>
                    {d.slides.length === 0 ? (
                      <p className="mono uppercase text-xs tracking-wider text-muted-foreground">
                        No slides
                      </p>
                    ) : (
                      <SlideGridForPresenter
                        phytoSet={d}
                        live={live}
                        slideW={slideW}
                        hiddenKeys={hiddenKeys}
                        manageMode={managing}
                        onToggleSection={(sectionKey, x, y) => toggleSection(id, sectionKey, x, y)}
                      />
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </main>

        {/* Right rail — hidden in mobile-preview mode. */}
        {effectiveViewMode === "slides" && (
          <aside className="h-[calc(100vh-73px)] space-y-4 overflow-auto border-l border-foreground bg-background p-4 md:sticky md:top-[73px]">
            <div>
              <div className="mono mb-2 text-[10px] uppercase tracking-wider">Output preview</div>
              <div className="relative overflow-hidden rounded-lg bg-[var(--brand-black)]">
                <DissolveSlide
                  slide={liveSlide}
                  versions={visibleVersions(liveSet, workspaceSettings)}
                  variant="preview"
                  durationMs={fadeMs}
                  videoCmd={live.videoCmd}
                  template={
                    liveSet?.kind === "song"
                      ? effectiveSongTemplate
                      : liveSet?.kind === "scripture" || liveSet?.kind === "message"
                        ? effectiveScriptureTemplate
                        : liveSet?.template
                  }
                />
                <div
                  className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black text-xs text-white/40"
                  style={{
                    opacity: live.blackout ? 1 : 0,
                    transition:
                      (live.blackoutFadeMs ?? 0) > 0
                        ? `opacity ${live.blackoutFadeMs}ms ease-in-out`
                        : undefined,
                  }}
                >
                  BLACK
                </div>
              </div>
              {liveSet && liveSlide && (
                <p className="mono uppercase mt-2 text-xs text-muted-foreground">
                  {liveSet.name} · {liveSet.slides.findIndex((s) => s.id === liveSlide.id) + 1}
                </p>
              )}
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <NumberStepper
                    value={fadeMs / 1000}
                    onChange={(s) => setFadeMs(Math.round(s * 1000))}
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
                <div className="flex items-center gap-1">
                  {liveSlide?.kind === "video" && (
                    <>
                      <button
                        onClick={() => live.setVideoPlaying(!isVideoPlaying(live))}
                        className="pill flex h-8 w-8 items-center justify-center border border-foreground text-muted-foreground transition hover:bg-foreground hover:text-background"
                        title={isVideoPlaying(live) ? "Stop video" : "Play video"}
                        aria-label={isVideoPlaying(live) ? "Stop video" : "Play video"}
                      >
                        {isVideoPlaying(live) ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => live.restartVideo()}
                        className="pill flex h-8 w-8 items-center justify-center border border-foreground text-muted-foreground transition hover:bg-foreground hover:text-background"
                        title="Restart video"
                        aria-label="Restart video"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => live.toggleBlackout()}
                    className="pill flex h-8 w-8 items-center justify-center border border-foreground text-muted-foreground transition hover:bg-[var(--brand-red)] hover:text-[var(--brand-white)] hover:border-[var(--brand-red)]"
                    title="Stop (Esc) — fades to black"
                    aria-label="Stop"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {activeSet?.kind === "media" && <MediaTemplateEditor setId={activeSet.id} />}

            {activeSet?.kind === "song" && <SongTemplateEditor />}
            {(activeSet?.kind === "scripture" || activeSet?.kind === "message") && (
              <ScriptureTemplateEditor />
            )}

            <div className="mono uppercase space-y-1 px-1 pt-2 text-xs text-muted-foreground">
              <div>→ / Space — next slide</div>
              <div>← — previous slide</div>
              <div>Esc — stop (fade to black)</div>
            </div>
          </aside>
        )}
      </div>

      <MediaAutoAdvance />

      {/* Cursor-following warning when hiding the last visible section. */}
      {hideWarning &&
        (() => {
          const W = 220,
            GAP = 16;
          const vw = window.innerWidth,
            vh = window.innerHeight;
          const left =
            hideWarning.x + W + GAP > vw
              ? Math.max(8, hideWarning.x - W - GAP)
              : hideWarning.x + GAP;
          const top =
            hideWarning.y + 60 + GAP > vh
              ? Math.max(8, hideWarning.y - 60 - GAP)
              : hideWarning.y + GAP;
          return (
            <div
              className="mono pointer-events-none fixed z-50 rounded-2xl border border-foreground bg-background p-3 text-[11px] leading-relaxed shadow-lg"
              style={{ left, top, width: W }}
            >
              You must have at least 1 section visible.
            </div>
          );
        })()}

      {/* Share dialog */}
      <ShareGatheringDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        shareUrl={shareUrl}
        gatheringName={activeGathering?.name ?? "gathering"}
        isLive={
          activeGathering == null || activeGathering.is_live === null
            ? null
            : isLiveNow(activeGathering)
        }
        slug={share.slug}
        onSlugSave={
          activeGathering && !activeGathering.shared && share.canCustomize ? share.save : undefined
        }
      />

      {/* Go Live confirmation — mirrors the home page: opens the share dialog
          once live so the leader can hand out the link. */}
      <Dialog
        open={showGoLiveDialog}
        onOpenChange={(open) => {
          if (isGoingLive) return;
          setShowGoLiveDialog(open);
        }}
      >
        <DialogContent className="gap-0 rounded-3xl p-8" aria-describedby={undefined}>
          <DialogTitle className="text-2xl font-normal leading-tight">Go live!</DialogTitle>
          <p className="mt-4 text-base">
            This gathering will stay live for 24 hours, unless you end it or go live on another one
            first.
          </p>
          <div className="mt-8">
            <button
              onClick={async () => {
                if (!activeGathering) return;
                setIsGoingLive(true);
                await goLive(activeGathering.id);
                setIsGoingLive(false);
                setShowGoLiveDialog(false);
                setShowShareDialog(true);
              }}
              disabled={isGoingLive}
              className="mono uppercase w-full rounded-full bg-[var(--brand-red)] py-2 text-sm text-[var(--brand-white)] transition hover:opacity-90 disabled:opacity-70"
            >
              {isGoingLive ? "Going Live..." : "Go Live"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* End Session confirmation */}
      <AlertDialog open={showEndSessionDialog} onOpenChange={setShowEndSessionDialog}>
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          <AlertDialogTitle className="text-2xl font-normal leading-tight">
            End this session?
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            Ending the session will take this gathering offline. You can go live again at any time.
          </AlertDialogDescription>
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => {
                if (activeGathering) endSession(activeGathering.id);
                setShowEndSessionDialog(false);
              }}
              className="mono uppercase flex-1 rounded-full bg-foreground py-2 text-sm text-background transition hover:opacity-90"
            >
              End Session
            </button>
            <button
              type="button"
              onClick={() => setShowEndSessionDialog(false)}
              className="mono uppercase flex-1 rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
            >
              Cancel
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete gathering confirmation — mirrors the home page. */}
      <AlertDialog open={showDeleteGatheringDialog} onOpenChange={setShowDeleteGatheringDialog}>
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          <AlertDialogTitle className="text-2xl font-normal leading-tight">
            Delete this gathering?
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            This will permanently delete this gathering. This cannot be undone.
          </AlertDialogDescription>
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => {
                if (activeGathering) deleteGathering(activeGathering.id);
                setShowDeleteGatheringDialog(false);
                setEditingGatheringName(false);
                navigate({ to: "/present" });
              }}
              className="mono uppercase flex-1 rounded-full bg-[var(--brand-red)] py-2 text-sm text-[var(--brand-white)] transition hover:opacity-90"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteGatheringDialog(false)}
              className="mono uppercase flex-1 rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
            >
              Cancel
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MediaAutoAdvance() {
  const setId = useLive((s) => s.setId);
  const slideId = useLive((s) => s.slideId);
  const blackout = useLive((s) => s.blackout);
  const videoEnded = useLive((s) => s.videoEnded);
  const phytoSet = useLibrary((s) => (setId ? s.sets[setId] : null));
  useEffect(() => {
    if (!phytoSet || phytoSet.kind !== "media") return;
    const ms = phytoSet.autoAdvanceMs ?? 0;
    if (ms <= 0 || !slideId || blackout) return;
    const idx = phytoSet.slides.findIndex((s) => s.id === slideId);
    if (idx === -1) return;
    // For video slides, hold off the auto-advance delay until the video has
    // finished playing — then wait `ms` before moving on. The effect re-runs
    // when `videoEnded` flips to true (set by the output window).
    if (phytoSet.slides[idx].kind === "video" && !videoEnded) return;
    const t = setTimeout(() => {
      const go = useLive.getState().go;
      const slides = phytoSet.slides;
      const next = slides[idx + 1];
      // Loop within the section: a divider after this slide (or the end of the
      // set) sends playback back to the section's first slide.
      if (phytoSet.loop && phytoSet.loopSection) {
        const atSectionEnd = slides[idx].sectionAfter !== undefined || !next;
        if (atSectionEnd) {
          let start = idx;
          while (start > 0 && slides[start - 1].sectionAfter === undefined) start -= 1;
          go(phytoSet.id, slides[start].id);
          return;
        }
      }
      if (next) go(phytoSet.id, next.id);
      else if (phytoSet.loop && slides[0]) go(phytoSet.id, slides[0].id);
    }, ms);
    return () => clearTimeout(t);
  }, [phytoSet, slideId, blackout, videoEnded]);
  return null;
}

// Only one slide may be fast-edited at a time across the whole presenter, so the
// open editor lives in a shared store keyed by slide id: opening another slide's
// editor closes the previous one. The draft text lives here too, so switching
// slides discards an unconfirmed edit rather than leaking it between thumbs.
const useFastEditSlide = create<{
  editingId: string | null;
  draft: string;
  open: (id: string, seed: string) => void;
  setDraft: (v: string) => void;
  close: () => void;
}>((set) => ({
  editingId: null,
  draft: "",
  open: (id, seed) => set({ editingId: id, draft: seed }),
  setDraft: (v) => set({ draft: v }),
  close: () => set({ editingId: null, draft: "" }),
}));

function PresenterThumb({
  slide,
  index,
  phytoSet,
  live,
  disabled = false,
}: {
  slide: Slide;
  index: number;
  phytoSet: PhytoSet;
  live: LiveApi;
  disabled?: boolean;
}) {
  const isLive = live.setId === phytoSet.id && live.slideId === slide.id;
  const updateSlide = useLibrary((s) => s.updateSlide);
  const workspaceSettings = useLibrary((s) => s.workspaceSettings);
  const songTemplate = useLibrary((s) => s.songTemplate);
  const songDraft = useSongTemplateDraft((s) => s.draft);
  const scriptureTemplate = useLibrary((s) => s.scriptureTemplate);
  const scriptureDraft = useScriptureTemplateDraft((s) => s.draft);
  const template =
    phytoSet.kind === "song"
      ? (songDraft ?? songTemplate)
      : phytoSet.kind === "scripture" || phytoSet.kind === "message"
        ? (scriptureDraft ?? scriptureTemplate)
        : phytoSet.template;

  // Fast Edit: adjust this slide's text lines in place, without opening the set
  // editor. Only text slides carry editable lines; media/image/blank do not.
  // Chords are hidden and NOT editable here: the textarea shows chord-stripped
  // lyrics. On confirm, reapplyChords re-anchors the original chords onto the
  // edited text (the same LCS reattach the full editor uses for its
  // chords-hidden mode), so editing a line keeps its chords rather than dropping
  // them.
  // Song lines and message points; a scripture's text is the translation's and
  // may be stacked in two versions, so it's edited in the set editor only.
  const canEdit = slide.kind === "lyric" || slide.kind === "point";
  const editingId = useFastEditSlide((s) => s.editingId);
  const draft = useFastEditSlide((s) => s.draft);
  const openEdit = useFastEditSlide((s) => s.open);
  const setDraft = useFastEditSlide((s) => s.setDraft);
  const closeEdit = useFastEditSlide((s) => s.close);
  const editing = editingId === slide.id;
  const startEdit = () => openEdit(slide.id, (slide.lines ?? []).map(stripChordsRaw).join("\n"));
  const confirmEdit = () => {
    const merged = reapplyChords((slide.lines ?? []).join("\n"), draft);
    updateSlide(phytoSet.id, slide.id, { lines: merged.split("\n") });
    closeEdit();
  };

  return (
    <div
      className="group relative w-full"
      style={
        isLive
          ? ({ "--live-color": kindLiveColor(phytoSet.kind) } as React.CSSProperties)
          : undefined
      }
    >
      <button
        onClick={() => live.go(phytoSet.id, slide.id)}
        disabled={disabled || editing}
        className={`w-full overflow-hidden rounded-lg border-2 text-left transition focus:outline-none focus-visible:outline-none ${
          isLive
            ? "border-[var(--live-color)] dark:border-foreground"
            : disabled
              ? "border-transparent"
              : "border-transparent hover:border-white dark:hover:border-foreground"
        } ${disabled ? "cursor-default" : ""}`}
      >
        <SlideView
          slide={slide}
          versions={visibleVersions(phytoSet, workspaceSettings)}
          variant="thumb"
          template={template}
        />
        <div className="mono absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white">
          {isLive && (
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: kindLiveColor(phytoSet.kind) }}
            />
          )}
          {index + 1}
        </div>
      </button>

      {/* Hover-revealed Fast Edit pencil, top-right of the slide preview.
          No outline — just the icon on a subtle chip for legibility. */}
      {canEdit && !disabled && !editing && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            startEdit();
          }}
          className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition hover:bg-black/80 focus-visible:opacity-100 group-hover:opacity-100"
          title="Edit text"
          aria-label="Edit slide text"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}

      {/* Inline editor: covers the preview. Cancel / Done sit at the top-right;
          changes apply only on Done. */}
      {editing && (
        <div
          className="absolute inset-0 z-20 flex flex-col overflow-hidden rounded-lg border-2 border-foreground bg-background"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-end gap-1 p-1">
            <button
              type="button"
              onClick={closeEdit}
              className="flex h-6 w-6 items-center justify-center rounded-full text-foreground transition hover:bg-foreground/10"
              title="Cancel"
              aria-label="Cancel edit"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={confirmEdit}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background transition hover:opacity-90"
              title="Done"
              aria-label="Confirm edit"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          </div>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                closeEdit();
              } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                confirmEdit();
              }
            }}
            className="mono w-full flex-1 resize-none bg-background px-2 pb-2 text-xs leading-snug outline-none"
          />
        </div>
      )}
    </div>
  );
}

const TINTS = ["var(--brand-blue)", "var(--brand-green)", "var(--brand-orange)"];

const SLIDE_GAP = 8;
const SECTION_PAD = 8;

function SlideGridForPresenter({
  phytoSet,
  live,
  slideW,
  hiddenKeys = [],
  manageMode = false,
  onToggleSection,
}: {
  phytoSet: PhytoSet;
  live: LiveApi;
  slideW: number;
  /** Stable section keys (label + occurrence) hidden this session. */
  hiddenKeys?: string[];
  /** When true, hidden sections stay visible (dimmed) with a toggle so they can
   *  be brought back; otherwise they collapse to a small marker. */
  manageMode?: boolean;
  onToggleSection?: (sectionKey: string, clientX: number, clientY: number) => void;
}) {
  // Media sections come from the editor's dividers; they're shown (coloured)
  // but can't be hidden, so a media set with no dividers is one group.
  const useSections =
    phytoSet.kind === "song" ||
    phytoSet.kind === "scripture" ||
    phytoSet.kind === "message" ||
    (phytoSet.kind === "media" &&
      phytoSet.slides.some(
        (sl) => sl.sectionAfter !== undefined || sl.sectionBefore !== undefined,
      ));
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!useSections) {
    return (
      <div ref={containerRef} className="flex flex-wrap gap-2">
        {phytoSet.slides.map((s, i) => (
          <div key={s.id} style={{ width: slideW }}>
            <PresenterThumb slide={s} index={i} phytoSet={phytoSet} live={live} />
          </div>
        ))}
      </div>
    );
  }

  const groups = groupSlides(phytoSet.slides);
  const hidden = new Set(hiddenKeys);

  // How many slides fit in one row given the measured container width
  const slidesPerRow =
    containerWidth > 0
      ? Math.max(
          1,
          Math.floor((containerWidth - SECTION_PAD * 2 + SLIDE_GAP) / (slideW + SLIDE_GAP)),
        )
      : 999;

  return (
    <div ref={containerRef} className="flex flex-wrap gap-2">
      {groups.map((g, gi) => {
        const isHidden = hidden.has(g.key);

        // Hidden and not being managed: render nothing — fully hidden.
        if (isHidden && !manageMode) return null;

        const cols = Math.min(g.items.length, slidesPerRow);
        const sectionWidth = cols * slideW + (cols - 1) * SLIDE_GAP + SECTION_PAD * 2;
        return (
          <div
            key={g.key}
            className="relative flex flex-wrap gap-2 rounded-xl p-2"
            style={{
              width: sectionWidth,
              backgroundColor: `color-mix(in oklab, ${TINTS[gi % TINTS.length]} ${manageMode ? 60 : 45}%, transparent)`,
            }}
          >
            {manageMode && (
              <button
                onClick={(e) => onToggleSection?.(g.key, e.clientX, e.clientY)}
                className="pill absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center border border-foreground bg-background transition hover:bg-foreground hover:text-background"
                title={
                  isHidden ? `Show ${g.section ?? "section"}` : `Hide ${g.section ?? "section"}`
                }
                aria-label={isHidden ? "Show section" : "Hide section"}
                aria-pressed={isHidden}
              >
                {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            )}
            <div className={`flex flex-wrap gap-2 transition ${isHidden ? "opacity-40" : ""}`}>
              {g.items.map(({ slide, index }) => (
                <div key={slide.id} style={{ width: slideW }}>
                  <PresenterThumb
                    slide={slide}
                    index={index}
                    phytoSet={phytoSet}
                    live={live}
                    disabled={manageMode}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
