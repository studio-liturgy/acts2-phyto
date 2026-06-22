import { createFileRoute, Link } from "@tanstack/react-router";
import { useLibrary, useLive, useSongTemplateDraft, useScriptureTemplateDraft } from "@/lib/store";
import { useIsSignedIn } from "@/lib/authStore";
import { APP_NAME } from "@/lib/appConfig";
import { SlideView, DissolveSlide } from "@/components/SlideView";
import { SongTemplateEditor } from "@/components/SongTemplateEditor";
import { ScriptureTemplateEditor } from "@/components/ScriptureTemplateEditor";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowUpLeft,
  ArrowUpRight,
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
  Copy,
  Check,
  QrCode,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
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

function KindBadge({ kind }: { kind: SetKind }) {
  return (
    <span className={`pill mono px-2 py-0.5 text-[10px] uppercase tracking-wider ${kindBadgeBg(kind)}`}>
      {kind === "mixed" ? "Mixed" : kind}
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
    meta: [
      { title: `Presenter | ${APP_NAME}` },
    ],
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

  const setList = activeGathering
    ? activeGathering.setIds.filter((id) => sets[id])
    : order;

  const [activeSetId, setActiveSetId] = useState<string | null>(
    setFromUrl ?? (live.setId && sets[live.setId] ? live.setId : null) ?? setList[0] ?? null
  );

  const presenterReturn = (setId: string) =>
    gatheringFromUrl
      ? `/present?gathering=${gatheringFromUrl}`
      : `/present?set=${setId}`;
  const [query, setQuery] = useState("");
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

  const isSignedIn = useIsSignedIn();
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showShareQr, setShowShareQr] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [qrFg, setQrFg] = useState("#212121");
  const [qrBg, setQrBg] = useState("#ffffff");
  const [qrTransparent, setQrTransparent] = useState(false);
  const shareQrRef = useRef<HTMLCanvasElement>(null);
  const qrFgCustomRef = useRef<HTMLInputElement>(null);

  const QR_FG_PRESETS = qrTransparent
    ? ['#212121', '#F5EFEF', '#2E7299', '#538844', '#E07D31', '#C01E21']
    : qrBg === '#000000'
      ? ['#F5EFEF', '#2E7299', '#538844', '#E07D31', '#C01E21']
      : ['#212121', '#2E7299', '#538844', '#E07D31', '#C01E21'];

  const setQrBackground = (bg: string | null) => {
    if (bg === null) {
      setQrTransparent(true);
    } else {
      setQrTransparent(false);
      setQrBg(bg);
      if (bg === '#ffffff' && qrFg === '#F5EFEF') setQrFg('#212121');
      if (bg === '#000000' && qrFg === '#212121') setQrFg('#F5EFEF');
    }
  };
  const activeShareToken = activeGathering?.share_token ?? null;
  const shareUrl = activeShareToken ? `${window.location.origin}/g/${activeShareToken}` : "";

  function downloadQr(ref: React.RefObject<HTMLCanvasElement | null>, filename: string) {
    const canvas = ref.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

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
  }, [activeGathering?.id]);

  const activeSet = activeSetId ? sets[activeSetId] : null;
  const liveSet = live.setId ? sets[live.setId] : null;
  const liveSlide = useMemo(
    () => liveSet?.slides.find((s) => s.id === live.slideId) ?? null,
    [liveSet, live.slideId]
  );

  const q = query.trim().toLowerCase();
  const showAll = !activeGathering;
  const filteredSets = setList.filter((id) => {
    if (!q) return true;
    const s = sets[id];
    if (!s) return false;
    if (s.name.toLowerCase().includes(q)) return true;
    return s.slides.some((slide) =>
      slide.lines?.some((line) => line.toLowerCase().includes(q))
    );
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
            slide.lines?.some((line) => line.toLowerCase().includes(q))
          );
        })
      : [];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!liveSet || !liveSlide) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const idx = liveSet.slides.findIndex((s) => s.id === liveSlide.id);
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        const next = liveSet.slides[idx + 1];
        if (next) live.go(liveSet.id, next.id);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        const prev = liveSet.slides[idx - 1];
        if (prev) live.go(liveSet.id, prev.id);
      } else if (e.key === "Escape") {
        e.preventDefault();
        live.toggleBlackout();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [liveSet, liveSlide, live]);

  const openOutput = () => window.open("/output", "_blank", "noopener,noreferrer");

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
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="rounded-full p-2 transition hover:bg-muted"
              title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
              aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            >
              {sidebarOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
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
                    onBlur={(e) => { renameGathering(activeGathering.id, e.target.value || activeGathering.name); setEditingGatheringName(false); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { renameGathering(activeGathering.id, e.currentTarget.value || activeGathering.name); setEditingGatheringName(false); }
                      if (e.key === "Escape") setEditingGatheringName(false);
                    }}
                  />
                ) : (
                  <span
                    className="min-w-0 truncate cursor-text text-3xl font-normal"
                    style={{ letterSpacing: "-0.045em", paddingRight: "0.1em" }}
                    onClick={() => { setEditingGatheringName(true); setTimeout(() => gatheringNameInputRef.current?.select(), 0); }}
                    title="Click to rename"
                  >
                    {activeGathering.name}
                  </span>
                )}
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isSignedIn && activeShareToken && (
              <button
                onClick={() => { setShowShareQr(false); setShowShareDialog(true); }}
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

            <div className="flex-1 overflow-auto pr-1">
              {showAll && filteredGatherings.length > 0 && (
                <div className="mb-5">
                  <div className="mono mb-2 px-1 text-[10px] uppercase tracking-wider">Gatherings</div>
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
                            <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--brand-red)]" title="Live" />
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeGathering && q && catalogueResults.length > 0 && (
                <div className="mb-2">
                  <div className="mono mb-2 px-1 text-[10px] uppercase tracking-wider">Catalogue</div>
                  <div className="space-y-1">
                    {catalogueResults.map((id) => {
                      const d = sets[id];
                      if (!d) return null;
                      return (
                        <button
                          key={id}
                          onClick={() => { addSetToGathering(activeGathering.id, id); setQuery(""); }}
                          className={`group flex w-full items-center justify-between gap-2 rounded-lg border-2 border-transparent px-2 py-1.5 text-left text-sm transition ${kindHoverBg(d.kind)}`}
                          title="Add to gathering"
                        >
                          <span className="truncate">{d.name}</span>
                          <span className="flex items-center gap-1">
                            <KindBadge kind={d.kind} />
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
                    "Sets"
                  )}
                </div>
                <div className="space-y-1">
                  {filteredSets.length === 0 && (
                    <p className="px-2 text-xs text-muted-foreground">
                      {activeGathering
                        ? q ? "No sets in this gathering match." : "Gathering is empty."
                        : q ? "No matches." : "No sets yet."}
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
                              <span className="mono mr-1 text-[10px] text-muted-foreground">{i + 1}.</span>
                            )}
                            {d.name}
                          </span>
                          <span className="flex items-center gap-1">
                            <KindBadge kind={d.kind} />
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
                Gathering is empty. Drag sets here.
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
                return (
                  <section key={id} id={`set-section-${id}`}>
                    <div className="mb-2 flex items-center gap-3">
                      <h3 className="text-lg">
                        <span className="mono mr-2 text-sm text-muted-foreground">{i + 1}.</span>
                        {d.name}
                      </h3>
                      <KindBadge kind={d.kind} />
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
                      {id === live.setId && (
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: kindLiveColor(d.kind) }} title="Live" />
                      )}
                    </div>
                    {d.slides.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No slides.</p>
                    ) : (
                      <SlideGridForPresenter phytoSet={d} live={live} slideW={slideW} />
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
                template={
                  liveSet?.kind === "song" ? effectiveSongTemplate
                  : liveSet?.kind === "scripture" ? effectiveScriptureTemplate
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

          {activeSet?.kind === "media" && (
            mediaFunctionsOpen ? (
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
            )
          )}

          {activeSet?.kind === "song" && <SongTemplateEditor />}
          {activeSet?.kind === "scripture" && <ScriptureTemplateEditor />}

          <div className="rounded-2xl border border-foreground">
            <button
              onClick={() => setShortcutsOpen((v) => !v)}
              className="mono uppercase flex w-full items-center justify-between px-4 py-1.5 text-xs tracking-wider"
            >
              <span>Shortcuts</span>
              {shortcutsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
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

      {/* Share dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="gap-0 rounded-3xl p-8" aria-describedby={undefined}>
          <DialogTitle className="text-2xl font-normal leading-tight">Share this gathering!</DialogTitle>

          <div className="mt-6 flex items-center gap-2">
            <div className="flex flex-1 items-center overflow-hidden rounded-full border border-foreground">
              <span className="flex-1 truncate px-4 font-mono uppercase text-sm text-muted-foreground">{shareUrl}</span>
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(shareUrl); setCopiedShare(true); setTimeout(() => setCopiedShare(false), 2000); }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background transition hover:opacity-90"
                aria-label="Copy URL"
              >
                <span className="transition-all duration-300">
                  {copiedShare ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowShareQr((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background transition hover:opacity-90"
              aria-label="QR Code"
            >
              <QrCode className="h-4 w-4" />
            </button>
          </div>

          {showShareQr && (
            <div className="mt-4 flex flex-col items-center gap-3">
              <div
                className="rounded-xl p-4"
                style={qrTransparent ? {
                  backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
                  backgroundSize: '10px 10px',
                  backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px',
                } : { backgroundColor: qrBg }}
              >
                <QRCodeCanvas ref={shareQrRef} value={shareUrl} size={180} fgColor={qrFg} bgColor={qrTransparent ? 'transparent' : qrBg} />
              </div>
              <div className="flex flex-col gap-2 self-stretch">
                <div className="flex items-center gap-3">
                  <span className="w-28 font-mono text-xs uppercase text-foreground">Dots</span>
                  <div className="flex gap-1.5">
                    {QR_FG_PRESETS.map(c => (
                      <button key={c} type="button" onClick={() => setQrFg(c)}
                        className="h-7 w-7 rounded-full border-2 transition"
                        style={{ backgroundColor: c, borderColor: qrFg === c ? 'var(--foreground)' : 'color-mix(in srgb, var(--foreground) 20%, transparent)' }}
                      />
                    ))}
                    <button type="button" onClick={() => qrFgCustomRef.current?.click()}
                      className="flex h-7 w-7 items-center justify-center rounded-full border-2 transition"
                      style={{
                        borderColor: 'color-mix(in srgb, var(--foreground) 20%, transparent)',
                        backgroundColor: QR_FG_PRESETS.includes(qrFg) ? 'transparent' : qrFg,
                        color: 'var(--foreground)',
                      }}
                    >
                      {QR_FG_PRESETS.includes(qrFg) && <span className="text-sm leading-none">+</span>}
                    </button>
                    <input ref={qrFgCustomRef} type="color" value={qrFg} onChange={e => setQrFg(e.target.value)} className="sr-only" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-28 font-mono text-xs uppercase text-foreground">Background</span>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => setQrBackground('#000000')}
                      className="h-7 w-7 rounded-full border-2 transition"
                      style={{ backgroundColor: '#000000', borderColor: !qrTransparent && qrBg === '#000000' ? 'var(--foreground)' : 'color-mix(in srgb, var(--foreground) 20%, transparent)' }}
                    />
                    <button type="button" onClick={() => setQrBackground('#ffffff')}
                      className="h-7 w-7 rounded-full border-2 transition"
                      style={{ backgroundColor: '#ffffff', borderColor: !qrTransparent && qrBg === '#ffffff' ? 'var(--foreground)' : 'color-mix(in srgb, var(--foreground) 20%, transparent)' }}
                    />
                    <button type="button" onClick={() => setQrBackground(null)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border-2 transition overflow-hidden"
                      style={{ borderColor: qrTransparent ? 'var(--foreground)' : 'color-mix(in srgb, var(--foreground) 20%, transparent)', padding: 0 }}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" style={{ display: 'block' }}>
                        <path d="M12 2 A10 10 0 0 1 12 22 Z" fill="#212121"/>
                        <path d="M12 22 A10 10 0 0 1 12 2 Z" fill="#F5EFEF"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => downloadQr(shareQrRef, `${activeGathering?.name ?? 'gathering'}-qr.png`)}
                className="mono uppercase rounded-full border border-foreground px-4 py-1.5 text-xs tracking-wider transition hover:bg-foreground hover:text-background"
              >
                Download
              </button>
            </div>
          )}

          {!activeGathering?.is_live && (
            <p className="mt-6 text-sm text-muted-foreground">
              Once live, this gathering will be accessible via this link.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MediaAutoAdvance() {
  const setId = useLive((s) => s.setId);
  const slideId = useLive((s) => s.slideId);
  const blackout = useLive((s) => s.blackout);
  const phytoSet = useLibrary((s) => (setId ? s.sets[setId] : null));
  useEffect(() => {
    if (!phytoSet || phytoSet.kind !== "media") return;
    const ms = phytoSet.autoAdvanceMs ?? 0;
    if (ms <= 0 || !slideId || blackout) return;
    const idx = phytoSet.slides.findIndex((s) => s.id === slideId);
    if (idx === -1) return;
    const t = setTimeout(() => {
      const go = useLive.getState().go;
      const next = phytoSet.slides[idx + 1];
      if (next) go(phytoSet.id, next.id);
      else if (phytoSet.loop && phytoSet.slides[0]) go(phytoSet.id, phytoSet.slides[0].id);
    }, ms);
    return () => clearTimeout(t);
  }, [phytoSet, slideId, blackout]);
  return null;
}

function MediaPlaybackControls({ setId }: { setId: string }) {
  const phytoSet = useLibrary((s) => s.sets[setId]);
  const updateSet = useLibrary((s) => s.updateSet);
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
              updateSet(setId, { autoAdvanceMs: n > 0 ? Math.round(n * 1000) : 0 });
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

function PresenterThumb({ slide, index, phytoSet, live }: { slide: Slide; index: number; phytoSet: PhytoSet; live: LiveApi }) {
  const isLive = live.setId === phytoSet.id && live.slideId === slide.id;
  const songTemplate = useLibrary((s) => s.songTemplate);
  const songDraft = useSongTemplateDraft((s) => s.draft);
  const scriptureTemplate = useLibrary((s) => s.scriptureTemplate);
  const scriptureDraft = useScriptureTemplateDraft((s) => s.draft);
  const template =
    phytoSet.kind === "song" ? (songDraft ?? songTemplate)
    : phytoSet.kind === "scripture" ? (scriptureDraft ?? scriptureTemplate)
    : phytoSet.template;
  return (
    <button
      onClick={() => live.go(phytoSet.id, slide.id)}
      className={`group relative w-full overflow-hidden rounded-lg border-2 text-left transition ${
        isLive ? "" : "border-transparent hover:border-foreground"
      }`}
      style={isLive ? { borderColor: kindLiveColor(phytoSet.kind) } : undefined}
    >
      <SlideView slide={slide} variant="thumb" template={template} />
      <div className="mono absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white">
        {isLive && (
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: kindLiveColor(phytoSet.kind) }} />
        )}
        {index + 1}
      </div>
    </button>
  );
}

const TINTS = ["var(--brand-blue)", "var(--brand-green)", "var(--brand-orange)"];

const SLIDE_GAP = 8;
const SECTION_PAD = 8;

function SlideGridForPresenter({ phytoSet, live, slideW }: { phytoSet: PhytoSet; live: LiveApi; slideW: number }) {
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

  const groups: { items: { slide: Slide; index: number }[] }[] = [];
  let currentSection: string | null = null;
  phytoSet.slides.forEach((s, i) => {
    const sec = sectionOf(s);
    const resolvedSection = sec ?? currentSection;
    const last = groups[groups.length - 1];
    if (!last || resolvedSection !== currentSection) {
      groups.push({ items: [{ slide: s, index: i }] });
      currentSection = resolvedSection;
    } else {
      last.items.push({ slide: s, index: i });
    }
  });

  // How many slides fit in one row given the measured container width
  const slidesPerRow = containerWidth > 0
    ? Math.max(1, Math.floor((containerWidth - SECTION_PAD * 2 + SLIDE_GAP) / (slideW + SLIDE_GAP)))
    : 999;

  return (
    <div ref={containerRef} className="flex flex-wrap gap-2">
      {groups.map((g, gi) => {
        const cols = Math.min(g.items.length, slidesPerRow);
        const sectionWidth = cols * slideW + (cols - 1) * SLIDE_GAP + SECTION_PAD * 2;
        return (
          <div
            key={gi}
            className="flex flex-wrap gap-2 rounded-xl p-2"
            style={{
              width: sectionWidth,
              backgroundColor: `color-mix(in oklab, ${TINTS[gi % TINTS.length]} 20%, transparent)`,
            }}
          >
            {g.items.map(({ slide, index }) => (
              <div key={slide.id} style={{ width: slideW }}>
                <PresenterThumb slide={slide} index={index} phytoSet={phytoSet} live={live} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}


