import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  useLibrary,
  useLive,
  useSongTemplateDraft,
  useScriptureTemplateDraft,
  useHiddenSections,
  isVideoPlaying,
} from "@/lib/store";
import { useIsSignedIn } from "@/lib/authStore";
import { APP_NAME } from "@/lib/appConfig";
import { SlideView, DissolveSlide } from "@/components/SlideView";
import { SongTemplateEditor } from "@/components/SongTemplateEditor";
import { ScriptureTemplateEditor } from "@/components/ScriptureTemplateEditor";
import { ShareGatheringDialog } from "@/components/ShareGatheringDialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
  ChevronDown,
  ChevronUp,
  House,
  Check,
  Eye,
  EyeOff,
  Play,
  Pause,
  RotateCcw,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Set as PhytoSet, SetKind, Slide } from "@/lib/types";
import { z } from "zod";

type LiveApi = ReturnType<typeof useLive.getState>;

function kindBadgeBg(kind: SetKind): string {
  if (kind === "song") return "bg-[var(--brand-blue)] text-[var(--brand-white)]";
  if (kind === "scripture") return "bg-[var(--brand-green)] text-[var(--brand-white)]";
  if (kind === "media") return "bg-[var(--brand-orange)] text-[var(--brand-white)]";
  return "bg-muted text-foreground";
}

function kindHoverBg(kind: SetKind): string {
  if (kind === "song") return "hover:bg-[var(--brand-blue)]/10";
  if (kind === "scripture") return "hover:bg-[var(--brand-green)]/10";
  if (kind === "media") return "hover:bg-[var(--brand-orange)]/10";
  return "hover:bg-muted/50";
}

function kindActiveBg(kind: SetKind): string {
  if (kind === "song") return "bg-[var(--brand-blue)]/10";
  if (kind === "scripture") return "bg-[var(--brand-green)]/10";
  if (kind === "media") return "bg-[var(--brand-orange)]/10";
  return "bg-muted/50";
}

function kindLiveColor(kind: SetKind): string {
  if (kind === "song") return "var(--brand-blue)";
  if (kind === "scripture") return "var(--brand-green)";
  if (kind === "media") return "var(--brand-orange)";
  return "var(--brand-red)";
}

const KIND_ABBREV: Record<SetKind, string> = {
  song: "SO",
  scripture: "SC",
  media: "ME",
  mixed: "MX",
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

const searchSchema = z.object({
  set: z.string().optional(),
  gathering: z.string().optional(),
});

export const Route = createFileRoute("/present")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: `Presenter | ${APP_NAME}` }, { name: "robots", content: "noindex" }],
  }),
  component: Presenter,
});

function Presenter() {
  const { set: setFromUrl, gathering: gatheringFromUrl } = Route.useSearch();
  const sets = useLibrary((s) => s.sets);
  const order = useLibrary((s) => s.order);
  const gatherings = useLibrary((s) => s.gatherings);
  const gatheringOrder = useLibrary((s) => s.gatheringOrder);
  const addSetToGathering = useLibrary((s) => s.addSetToGathering);
  const removeSetFromGathering = useLibrary((s) => s.removeSetFromGathering);
  const reorderGatheringSets = useLibrary((s) => s.reorderGatheringSets);
  const renameGathering = useLibrary((s) => s.renameGathering);
  const createSet = useLibrary((s) => s.createSet);
  const createGathering = useLibrary((s) => s.createGathering);
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

  const activeGathering = gatheringFromUrl ? gatherings[gatheringFromUrl] : null;

  const setList = activeGathering ? activeGathering.setIds.filter((id) => sets[id]) : order;

  const [activeSetId, setActiveSetId] = useState<string | null>(
    setFromUrl ?? (live.setId && sets[live.setId] ? live.setId : null) ?? setList[0] ?? null,
  );

  const presenterReturn = (setId: string) =>
    gatheringFromUrl ? `/present?gathering=${gatheringFromUrl}` : `/present?set=${setId}`;
  const [query, setQuery] = useState("");
  const [setSortMode, setSetSortMode] = useState<"az" | "newest">("az");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [slideW, setSlideW] = useState(() => {
    if (typeof window === "undefined") return 256;
    const saved = localStorage.getItem("presenter-slide-w");
    return saved ? Number(saved) : 256;
  });
  const [dragOverGathering, setDragOverGathering] = useState<string | null>(null);
  const [reorderDraggingId, setReorderDraggingId] = useState<string | null>(null);
  const [reorderLiveOrder, setReorderLiveOrder] = useState<string[] | null>(null);
  const reorderLiveRef = useRef<string[] | null>(null);
  const reorderDragIndex = useRef<number | null>(null);
  const [editingGatheringName, setEditingGatheringName] = useState(false);
  const gatheringNameInputRef = useRef<HTMLInputElement>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [mediaFunctionsOpen, setMediaFunctionsOpen] = useState(false);

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
      const groups = sets[setId] ? groupSlides(sets[setId]) : [];
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
  const activeShareToken = activeGathering?.share_token ?? null;
  const shareUrl = activeShareToken ? `${window.location.origin}/g/${activeShareToken}` : "";

  useEffect(() => {
    if (setFromUrl) setActiveSetId(setFromUrl);
  }, [setFromUrl]);
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
    setReorderDraggingId(null);
    reorderDragIndex.current = null;
    setManageSet(null);
  }, [activeGathering?.id]);

  const activeSet = activeSetId ? sets[activeSetId] : null;
  const liveSet = live.setId ? sets[live.setId] : null;
  const liveSlide = useMemo(
    () => liveSet?.slides.find((s) => s.id === live.slideId) ?? null,
    [liveSet, live.slideId],
  );

  const q = query.trim().toLowerCase();
  const showAll = !activeGathering;
  const filteredSets = setList
    .filter((id) => {
      if (!q) return true;
      const s = sets[id];
      if (!s) return false;
      if (s.name.toLowerCase().includes(q)) return true;
      return s.slides.some((slide) => slide.lines?.some((line) => line.toLowerCase().includes(q)));
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

  // While inside a gathering, a search also scans the entire catalogue for sets
  // not yet in this gathering, surfaced above the gathering's own sets so they
  // can be inserted on the fly.
  const catalogueResults =
    activeGathering && q
      ? order.filter((id) => {
          if (activeGathering.setIds.includes(id)) return false;
          const s = sets[id];
          if (!s) return false;
          if (s.name.toLowerCase().includes(q)) return true;
          return s.slides.some((slide) =>
            slide.lines?.some((line) => line.toLowerCase().includes(q)),
          );
        })
      : [];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!liveSet || !liveSlide) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const hidden = hiddenSlideIds(liveSet, hiddenBySet[liveSet.id] ?? []);
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
      year: "numeric",
    });
    const id = createGathering(today);
    navigate({ to: "/present", search: { gathering: id } });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-foreground bg-background">
        <div className="flex items-center gap-4 px-6 py-4">
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/"
              className="pill flex h-10 w-10 items-center justify-center bg-foreground text-background transition hover:opacity-90"
              title="Home"
              aria-label="Home"
            >
              <House className="h-5 w-5" />
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="pill flex h-10 w-10 items-center justify-center bg-foreground text-background transition hover:opacity-90"
                  title="New"
                  aria-label="New"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onClick={() => newSet("song")}
                  className="mono uppercase text-xs tracking-wider focus:bg-[var(--brand-blue)] focus:text-[var(--brand-white)]"
                >
                  New Song
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => newSet("scripture")}
                  className="mono uppercase text-xs tracking-wider focus:bg-[var(--brand-green)] focus:text-[var(--brand-white)]"
                >
                  New Scripture
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => newSet("media")}
                  className="mono uppercase text-xs tracking-wider focus:bg-[var(--brand-orange)] focus:text-[var(--brand-white)]"
                >
                  New Media
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={newGathering}
                  className="mono uppercase text-xs tracking-wider"
                >
                  New Gathering
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
              title="Slide size"
              aria-label="Slide size"
            />
          </div>

          <div className="flex flex-1 items-center justify-center gap-3">
            <h1 className="shrink-0 text-3xl">Presenter</h1>
            {activeGathering && (
              <>
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${activeGathering.is_live ? "bg-[var(--brand-red)] animate-pulse" : "bg-foreground"}`}
                  title={activeGathering.is_live ? "Live" : undefined}
                />
                {editingGatheringName ? (
                  <input
                    ref={gatheringNameInputRef}
                    defaultValue={activeGathering.name}
                    className="w-48 rounded-full border border-foreground bg-transparent px-4 py-1.5 text-base font-normal outline-none"
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
                ) : (
                  <>
                    <span
                      className="min-w-0 truncate cursor-text text-3xl font-normal"
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
                      className="pill flex h-8 w-8 shrink-0 items-center justify-center border border-foreground transition hover:bg-foreground hover:text-background"
                      title="Rename gathering"
                      aria-label="Rename gathering"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isSignedIn && activeShareToken && (
              <button
                onClick={() => setShowShareDialog(true)}
                className="pill flex h-10 w-10 items-center justify-center border border-foreground transition hover:bg-foreground hover:text-background"
                title="Share gathering"
                aria-label="Share gathering"
              >
                <Share2 className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={openOutput}
              className="pill mono uppercase flex items-center gap-2 border border-foreground px-5 py-2 text-sm transition hover:bg-foreground hover:text-background"
              title="Output window"
            >
              Output <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div
        className={`grid flex-1 gap-0 ${
          sidebarOpen ? "md:grid-cols-[240px_1fr_320px]" : "md:grid-cols-[1fr_320px]"
        }`}
      >
        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="flex h-[calc(100vh-73px)] flex-col border-r border-foreground bg-background p-4 md:sticky md:top-[73px]">
            <div className="pill mb-4 flex items-center gap-2 border border-foreground bg-background px-4 py-2">
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
                          {p.is_live && pid !== gatheringFromUrl && (
                            <span
                              className="h-2 w-2 shrink-0 rounded-full bg-[var(--brand-red)]"
                              title="Live"
                            />
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeGathering && q && catalogueResults.length > 0 && (
                <div className="mb-2">
                  <div className="mono mb-2 px-1 text-[10px] uppercase tracking-wider">
                    Catalogue
                  </div>
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
                            <KindBadge kind={d.kind} abbrev />
                            <Plus className="h-4 w-4 opacity-40 group-hover:opacity-100" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {/* Thin line marking the boundary between catalogue matches
                      above and this gathering's own sets below — mirrors the
                      local/online divider in the set-editor song search. */}
                  <div className="mx-2 mt-2 h-px bg-foreground" />
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
                      <span>Sets</span>
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
                  )}
                </div>
                <div className="space-y-1">
                  {filteredSets.length === 0 && (
                    <p className="px-2 text-xs text-muted-foreground">
                      {activeGathering
                        ? q
                          ? "No sets in this gathering match."
                          : "Gathering is empty. Search above to add a set."
                        : q
                          ? "No matches."
                          : "No sets yet."}
                    </p>
                  )}
                  {(reorderLiveOrder ?? filteredSets).map((id, i) => {
                    const d = sets[id];
                    if (!d) return null;
                    const isActive = id === activeSetId;
                    const isLive = id === live.setId;
                    const inGathering = !!activeGathering;
                    const isDragging = id === reorderDraggingId;
                    return (
                      <button
                        key={id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("application/x-set-id", id);
                          e.dataTransfer.effectAllowed = inGathering ? "move" : "copy";
                          if (inGathering) {
                            setReorderDraggingId(id);
                            reorderDragIndex.current = i;
                          }
                        }}
                        onDragOver={(e) => {
                          if (!inGathering || reorderDragIndex.current === null) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          const current = reorderLiveOrder ?? filteredSets;
                          const fromIdx = current.indexOf(reorderDraggingId!);
                          if (fromIdx === i || fromIdx === -1) return;
                          const next = [...current];
                          next.splice(fromIdx, 1);
                          next.splice(i, 0, reorderDraggingId!);
                          reorderLiveRef.current = next;
                          setReorderLiveOrder(next);
                        }}
                        onDragEnd={() => {
                          if (reorderLiveRef.current && activeGathering)
                            reorderGatheringSets(activeGathering.id, reorderLiveRef.current);
                          reorderLiveRef.current = null;
                          setReorderLiveOrder(null);
                          setReorderDraggingId(null);
                          reorderDragIndex.current = null;
                        }}
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
                        <span className="flex items-center gap-1 truncate">
                          {inGathering && (
                            <span className="mono mr-1 text-[10px] text-muted-foreground">
                              {i + 1}.
                            </span>
                          )}
                          {d.name}
                        </span>
                        <span className="flex items-center gap-1">
                          <KindBadge kind={d.kind} abbrev />
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
        <main className="overflow-auto p-6">
          {activeGathering ? (
            setList.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Gathering is empty. Search the sidebar or drag a set here to add one.
              </div>
            ) : null
          ) : !activeSet ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a set to begin.
            </div>
          ) : activeSet.slides.length === 0 ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              This set has no slides.
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
            <>
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-2xl">{activeSet.name}</h2>
                <KindBadge kind={activeSet.kind} />
                <Link
                  to="/set/$setId"
                  params={{ setId: activeSet.id }}
                  search={{ redirectTo: presenterReturn(activeSet.id) }}
                  className="pill flex h-8 w-8 shrink-0 items-center justify-center border border-foreground transition hover:bg-foreground hover:text-background"
                  title="Edit set"
                  aria-label="Edit set"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
              </div>
              <SlideGridForPresenter phytoSet={activeSet} live={live} slideW={slideW} />
            </>
          )}

          {activeGathering && setList.length > 0 && (
            <div className="space-y-8">
              {setList.map((id, i) => {
                const d = sets[id];
                if (!d) return null;
                const canHide = d.kind === "song";
                const hiddenKeys = hiddenBySet[id] ?? [];
                // Count only keys that still match a current section group, so a
                // stale key left over from a prior edit never shows a phantom
                // "hidden" badge.
                const activeHiddenCount = canHide
                  ? (() => {
                      const groupKeys = new Set(groupSlides(d).map((g) => g.key));
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
                      <p className="text-xs text-muted-foreground">No slides.</p>
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

        {/* Right rail */}
        <aside className="h-[calc(100vh-73px)] space-y-4 overflow-auto border-l border-foreground bg-background p-4 md:sticky md:top-[73px]">
          <div>
            <div className="mono mb-2 text-[10px] uppercase tracking-wider">Output preview</div>
            <div className="relative overflow-hidden rounded-lg bg-[var(--brand-black)]">
              <DissolveSlide
                slide={liveSlide}
                variant="preview"
                durationMs={fadeMs}
                videoCmd={live.videoCmd}
                template={
                  liveSet?.kind === "song"
                    ? effectiveSongTemplate
                    : liveSet?.kind === "scripture"
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
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={0.1}
                  value={fadeMs ? (fadeMs / 1000).toFixed(1) : ""}
                  placeholder="0"
                  onChange={(e) => {
                    const n = Math.min(5, Math.max(0, Number(e.target.value) || 0));
                    setFadeMs(Math.round(n * 1000));
                  }}
                  className="pill h-7 w-14 border border-foreground bg-background px-2 text-xs outline-none"
                  title="Slide fade duration"
                  aria-label="Slide fade duration"
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

          {activeSet?.kind === "media" &&
            (mediaFunctionsOpen ? (
              <div className="rounded-2xl border border-foreground p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="mono text-[10px] uppercase tracking-wider">Media Functions</div>
                  <button
                    onClick={() => setMediaFunctionsOpen(false)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
                <MediaPlaybackControls setId={activeSet.id} />
                <button
                  onClick={() => setMediaFunctionsOpen(false)}
                  className="pill mono uppercase mt-3 flex w-full items-center justify-center border border-foreground bg-foreground px-4 py-1.5 text-xs tracking-wider text-background transition hover:opacity-90"
                >
                  Apply to this media set
                </button>
              </div>
            ) : (
              <button
                onClick={() => setMediaFunctionsOpen(true)}
                className="mono uppercase pill flex w-full items-center justify-center border border-foreground px-4 py-1.5 text-xs tracking-wider transition hover:bg-foreground hover:text-background"
              >
                Edit Media Functions
              </button>
            ))}

          {activeSet?.kind === "song" && <SongTemplateEditor />}
          {activeSet?.kind === "scripture" && <ScriptureTemplateEditor />}

          <div className="rounded-2xl border border-foreground">
            <button
              onClick={() => setShortcutsOpen((v) => !v)}
              className="mono uppercase flex w-full items-center justify-between px-4 py-1.5 text-xs tracking-wider"
            >
              <span>Shortcuts</span>
              {shortcutsOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {shortcutsOpen && (
              <div className="mono uppercase space-y-1 border-t border-foreground/20 px-4 py-3 text-xs text-muted-foreground">
                <div>→ / Space — next slide</div>
                <div>← — previous slide</div>
                <div>Esc — stop (fade to black)</div>
              </div>
            )}
          </div>
        </aside>
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
        isLive={activeGathering?.is_live ?? null}
      />
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
      const next = phytoSet.slides[idx + 1];
      if (next) go(phytoSet.id, next.id);
      else if (phytoSet.loop && phytoSet.slides[0]) go(phytoSet.id, phytoSet.slides[0].id);
    }, ms);
    return () => clearTimeout(t);
  }, [phytoSet, slideId, blackout, videoEnded]);
  return null;
}

function MediaPlaybackControls({ setId }: { setId: string }) {
  const phytoSet = useLibrary((s) => s.sets[setId]);
  const updateSet = useLibrary((s) => s.updateSet);
  const [autoplayNotice, setAutoplayNotice] = useState(false);
  if (!phytoSet) return null;
  const auto = phytoSet.autoAdvanceMs ?? 0;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="mono text-[10px] uppercase tracking-wider">Auto advance</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            step={0.5}
            value={auto ? (auto / 1000).toString() : ""}
            placeholder="off"
            onChange={(e) => {
              const n = Number(e.target.value);
              const ms = n > 0 ? Math.round(n * 1000) : 0;
              const patch: Partial<PhytoSet> = { autoAdvanceMs: ms };
              // Auto advance relies on videos playing on their own, so turning it
              // on flips every video slide to autoplay. Tell the operator.
              if (ms > 0 && phytoSet.slides.some((s) => s.kind === "video" && !s.autoplay)) {
                patch.slides = phytoSet.slides.map((s) =>
                  s.kind === "video" ? { ...s, autoplay: true } : s,
                );
                setAutoplayNotice(true);
              }
              updateSet(setId, patch);
            }}
            className="pill h-7 w-16 border border-foreground bg-background px-3 text-xs outline-none"
          />
          <span className="text-xs text-muted-foreground">s</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="mono text-[10px] uppercase tracking-wider">Loop</span>
        <input
          type="checkbox"
          checked={!!phytoSet.loop}
          onChange={(e) => updateSet(setId, { loop: e.target.checked })}
        />
      </div>
      <Dialog open={autoplayNotice} onOpenChange={setAutoplayNotice}>
        <DialogContent className="gap-0 rounded-3xl p-8" aria-describedby={undefined}>
          <DialogTitle className="text-2xl font-normal leading-tight">
            Videos set to autoplay
          </DialogTitle>

          <p className="mt-4 text-base">
            Auto advance needs videos to start on their own, so every video slide in this set is now
            set to autoplay. They'll play, then the set advances after the delay you set.
          </p>

          <div className="mt-8">
            <button
              type="button"
              onClick={() => setAutoplayNotice(false)}
              className="mono uppercase w-full rounded-full bg-foreground py-2 text-sm text-background transition hover:opacity-90"
            >
              Got it
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const SECTION_RE =
  /^\s*\[?(verse\s*\d*|chorus|bridge|pre[- ]?chorus|intro|outro|tag|interlude|refrain)\]?:?\s*$/i;

function sectionOf(s: Slide): string | null {
  if (s.section && s.section.trim()) return s.section.trim();
  if (s.kind === "lyric" && s.reference && SECTION_RE.test(s.reference)) {
    return s.reference.trim();
  }
  return null;
}

type SlideGroup = {
  /** Resolved section label for the group; null when unlabeled. */
  section: string | null;
  /** Stable identity for section-hiding and React keys: the resolved label plus
   *  its occurrence index (e.g. "Chorus#0", "Verse 2#0", "§none#0"). Unlike a
   *  slide id, this survives the slide-id regeneration that happens when a
   *  song/scripture set is edited, so a hidden section stays hidden. */
  key: string;
  items: { slide: Slide; index: number }[];
};

/** Group consecutive slides by their resolved section, the same way the
 *  presenter grid renders them. Shared so navigation and the grid agree. */
function groupSlides(phytoSet: PhytoSet): SlideGroup[] {
  const groups: SlideGroup[] = [];
  let currentSection: string | null = null;
  phytoSet.slides.forEach((s, i) => {
    const sec = sectionOf(s);
    const resolvedSection = sec ?? currentSection;
    const last = groups[groups.length - 1];
    if (!last || resolvedSection !== currentSection) {
      groups.push({ section: resolvedSection, key: "", items: [{ slide: s, index: i }] });
      currentSection = resolvedSection;
    } else {
      last.items.push({ slide: s, index: i });
    }
  });
  // Assign stable keys: label + per-label occurrence index, so two distinct
  // "Chorus" sections stay independently hideable.
  const seen = new Map<string, number>();
  for (const g of groups) {
    const label = g.section ?? "§none";
    const n = seen.get(label) ?? 0;
    seen.set(label, n + 1);
    g.key = `${label}#${n}`;
  }
  return groups;
}

/** Slide ids belonging to the hidden section groups (identified by stable key). */
function hiddenSlideIds(phytoSet: PhytoSet, hiddenKeys: string[]): Set<string> {
  const ids = new Set<string>();
  if (hiddenKeys.length === 0) return ids;
  const keys = new Set(hiddenKeys);
  for (const g of groupSlides(phytoSet)) {
    if (keys.has(g.key)) for (const it of g.items) ids.add(it.slide.id);
  }
  return ids;
}

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
  const songTemplate = useLibrary((s) => s.songTemplate);
  const songDraft = useSongTemplateDraft((s) => s.draft);
  const scriptureTemplate = useLibrary((s) => s.scriptureTemplate);
  const scriptureDraft = useScriptureTemplateDraft((s) => s.draft);
  const template =
    phytoSet.kind === "song"
      ? (songDraft ?? songTemplate)
      : phytoSet.kind === "scripture"
        ? (scriptureDraft ?? scriptureTemplate)
        : phytoSet.template;
  return (
    <button
      onClick={() => live.go(phytoSet.id, slide.id)}
      disabled={disabled}
      className={`group relative w-full overflow-hidden rounded-lg border-2 text-left transition focus:outline-none focus-visible:outline-none ${
        isLive
          ? "border-[var(--live-color)] dark:border-foreground"
          : disabled
            ? "border-transparent"
            : "border-transparent hover:border-white dark:hover:border-foreground"
      } ${disabled ? "cursor-default" : ""}`}
      style={isLive ? ({ "--live-color": kindLiveColor(phytoSet.kind) } as React.CSSProperties) : undefined}
    >
      <SlideView slide={slide} variant="thumb" template={template} />
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
  const useSections = phytoSet.kind === "song" || phytoSet.kind === "scripture";
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

  const groups = groupSlides(phytoSet);
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
