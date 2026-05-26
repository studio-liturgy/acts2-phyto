import { createFileRoute, Link } from "@tanstack/react-router";
import { useLibrary, useLive, useSongTemplateDraft } from "@/lib/store";
import { SlideView, DissolveSlide } from "@/components/SlideView";
import { Input } from "@/components/ui/input";
import {
  ArrowUpLeft,
  ArrowUpRight,
  X,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  ChevronDown,
  ChevronUp,
  House,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

function KindBadge({ kind }: { kind: SetKind }) {
  return (
    <span className={`pill mono px-2 py-0.5 text-[10px] uppercase tracking-wider ${kindBadgeBg(kind)}`}>
      {kind === "mixed" ? "Mixed" : kind}
    </span>
  );
}

const searchSchema = z.object({
  set: z.string().optional(),
  playlist: z.string().optional(),
});

export const Route = createFileRoute("/present")({
  validateSearch: searchSchema,
  component: Presenter,
});

function Presenter() {
  const { set: setFromUrl, playlist: playlistFromUrl } = Route.useSearch();
  const sets = useLibrary((s) => s.sets);
  const order = useLibrary((s) => s.order);
  const playlists = useLibrary((s) => s.playlists);
  const playlistOrder = useLibrary((s) => s.playlistOrder);
  const addSetToPlaylist = useLibrary((s) => s.addSetToPlaylist);
  const removeSetFromPlaylist = useLibrary((s) => s.removeSetFromPlaylist);
  const reorderPlaylistSets = useLibrary((s) => s.reorderPlaylistSets);
  const live = useLive();
  const songTemplate = useLibrary((s) => s.songTemplate);
  const songDraft = useSongTemplateDraft((s) => s.draft);
  const effectiveSongTemplate = songDraft ?? songTemplate;

  const activePlaylist = playlistFromUrl ? playlists[playlistFromUrl] : null;

  const setList = activePlaylist
    ? activePlaylist.setIds.filter((id) => sets[id])
    : order;

  const [activeSetId, setActiveSetId] = useState<string | null>(
    setFromUrl ?? setList[0] ?? null
  );
  const [query, setQuery] = useState("");
  const [groupView, setGroupView] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dragOverPlaylist, setDragOverPlaylist] = useState<string | null>(null);
  const [reorderDragIndex, setReorderDragIndex] = useState<number | null>(null);
  const [reorderOverIndex, setReorderOverIndex] = useState<number | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    if (setFromUrl) setActiveSetId(setFromUrl);
  }, [setFromUrl]);
  useEffect(() => {
    if (activePlaylist && !activeSetId) {
      setActiveSetId(activePlaylist.setIds[0] ?? null);
    }
  }, [activePlaylist, activeSetId]);

  const activeSet = activeSetId ? sets[activeSetId] : null;
  const liveSet = live.setId ? sets[live.setId] : null;
  const liveSlide = useMemo(
    () => liveSet?.slides.find((s) => s.id === live.slideId) ?? null,
    [liveSet, live.slideId]
  );

  const q = query.trim().toLowerCase();
  const showAll = !activePlaylist;
  const filteredSets = setList.filter(
    (id) => !q || sets[id]?.name.toLowerCase().includes(q)
  );
  const filteredPlaylists = showAll ? playlistOrder : [];

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
      <header className="sticky top-0 z-30 border-b border-foreground/10 bg-background">
        <div className="grid grid-cols-3 items-center gap-4 px-6 py-4">
          <div className="flex items-center gap-2 justify-self-start">
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
          </div>

          <div className="flex items-center justify-center gap-3 justify-self-center">
            <h1 className="text-3xl">Presenter</h1>
            {activePlaylist && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="truncate text-lg text-muted-foreground">{activePlaylist.name}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 justify-self-end">
            <button
              onClick={openOutput}
              className="pill flex items-center gap-2 border border-foreground px-5 py-2 text-sm transition hover:bg-foreground hover:text-background"
              title="Output window"
            >
              Output <ArrowUpRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => live.clearLive()}
              className="pill flex h-10 w-10 items-center justify-center border border-foreground text-muted-foreground transition hover:bg-[var(--brand-red)] hover:text-[var(--brand-white)] hover:border-[var(--brand-red)]"
              title="Stop (Esc) — fades to black"
              aria-label="Stop"
            >
              <X className="h-4 w-4" />
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
          <aside className="flex h-[calc(100vh-73px)] flex-col border-r border-foreground/10 bg-background p-4 md:sticky md:top-[73px]">
            <div className="pill mb-4 flex items-center gap-2 border border-foreground bg-background px-4 py-2">
              <Search className="h-4 w-4" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for a set"
                className="mono w-full bg-transparent text-xs italic outline-none placeholder:text-muted-foreground"
              />
            </div>

            <div className="flex-1 overflow-auto pr-1">
              {showAll && filteredPlaylists.length > 0 && (
                <div className="mb-5">
                  <div className="mono mb-2 px-1 text-[10px] uppercase tracking-wider">Gatherings</div>
                  <div className="space-y-1">
                    {filteredPlaylists.map((pid) => {
                      const p = playlists[pid];
                      if (!p) return null;
                      const isDragOver = dragOverPlaylist === pid;
                      return (
                        <Link
                          key={pid}
                          to="/present"
                          search={{ playlist: pid }}
                          onDragOver={(e) => {
                            if (e.dataTransfer.types.includes("application/x-set-id")) {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "copy";
                              if (dragOverPlaylist !== pid) setDragOverPlaylist(pid);
                            }
                          }}
                          onDragLeave={() => {
                            if (dragOverPlaylist === pid) setDragOverPlaylist(null);
                          }}
                          onDrop={(e) => {
                            const setId = e.dataTransfer.getData("application/x-set-id");
                            setDragOverPlaylist(null);
                            if (!setId) return;
                            e.preventDefault();
                            if (!p.setIds.includes(setId)) addSetToPlaylist(pid, setId);
                          }}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-muted ${
                            isDragOver ? "bg-foreground/10 ring-1 ring-foreground" : ""
                          }`}
                        >
                          <span className="truncate">{p.name}</span>
                          <span className="mono text-[10px] text-muted-foreground">{p.setIds.length}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <div className="mono mb-2 px-1 text-[10px] uppercase tracking-wider">
                  {activePlaylist ? (
                    <span className="inline-flex items-center gap-2">
                      <Link to="/present" title="Back to all" aria-label="Back to all">
                        <ArrowUpLeft className="h-3.5 w-3.5" />
                      </Link>
                      {activePlaylist.name}
                    </span>
                  ) : (
                    "Sets"
                  )}
                </div>
                <div className="space-y-1">
                  {filteredSets.length === 0 && (
                    <p className="px-2 text-xs text-muted-foreground">
                      {activePlaylist ? "Gathering is empty." : q ? "No matches." : "No sets yet."}
                    </p>
                  )}
                  {filteredSets.map((id, i) => {
                    const d = sets[id];
                    if (!d) return null;
                    const isActive = id === activeSetId;
                    const isLive = id === live.setId;
                    const inGathering = !!activePlaylist;
                    const isReorderTarget = inGathering && reorderOverIndex === i && reorderDragIndex !== null;
                    return (
                      <div
                        key={`${id}-${i}`}
                        onDragOver={(e) => {
                          if (!inGathering || reorderDragIndex === null) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          if (reorderOverIndex !== i) setReorderOverIndex(i);
                        }}
                        onDrop={(e) => {
                          if (!inGathering || reorderDragIndex === null || !activePlaylist) return;
                          e.preventDefault();
                          e.stopPropagation();
                          const ids = [...activePlaylist.setIds];
                          const [moved] = ids.splice(reorderDragIndex, 1);
                          ids.splice(i, 0, moved);
                          reorderPlaylistSets(activePlaylist.id, ids);
                          setReorderDragIndex(null);
                          setReorderOverIndex(null);
                        }}
                        className={isReorderTarget ? "rounded-lg ring-1 ring-foreground" : ""}
                      >
                        <button
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("application/x-set-id", id);
                            e.dataTransfer.effectAllowed = inGathering ? "move" : "copy";
                            if (inGathering) setReorderDragIndex(i);
                          }}
                          onDragEnd={() => {
                            setReorderDragIndex(null);
                            setReorderOverIndex(null);
                          }}
                          onClick={() => {
                            setActiveSetId(id);
                            if (activePlaylist) {
                              const el = document.getElementById(`set-section-${id}`);
                              el?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }
                          }}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg border-2 px-2 py-1.5 text-left text-sm transition ${
                            isLive
                              ? "border-[var(--brand-red)]"
                              : isActive
                              ? "border-transparent bg-muted"
                              : `border-transparent ${kindHoverBg(d.kind)}`
                          }`}
                        >
                          <span className="flex items-center gap-1 truncate">
                            {inGathering && (
                              <span className="mono mr-1 text-[10px] text-muted-foreground">{i + 1}.</span>
                            )}
                            {d.name}
                          </span>
                          <span className="flex items-center gap-1">
                            <KindBadge kind={d.kind} />
                            {inGathering && activePlaylist && (
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeSetFromPlaylist(activePlaylist.id, i);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.stopPropagation();
                                    removeSetFromPlaylist(activePlaylist.id, i);
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
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* Main */}
        <main className="overflow-auto p-6">
          {activePlaylist ? (
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
                search={{ redirectTo: "/present" }}
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
                  search={{ redirectTo: "/present" }}
                  className="pill flex h-8 w-8 items-center justify-center border border-foreground transition hover:bg-foreground hover:text-background"
                  title="Edit set"
                  aria-label="Edit set"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
                {(activeSet.kind === "song" || activeSet.kind === "scripture") && (
                  <label className="mono flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={groupView}
                      onChange={(e) => setGroupView(e.target.checked)}
                    />
                    Group
                  </label>
                )}
              </div>
              <SlideGridForPresenter
                phytoSet={activeSet}
                live={live}
                grouped={groupView && (activeSet.kind === "song" || activeSet.kind === "scripture")}
              />
            </>
          )}

          {activePlaylist && setList.length > 0 && (
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
                        search={{ redirectTo: "/present" }}
                        className="pill flex h-7 w-7 items-center justify-center border border-foreground transition hover:bg-foreground hover:text-background"
                        title="Edit set"
                        aria-label="Edit set"
                      >
                        <Pencil className="h-3 w-3" />
                      </Link>
                      {id === live.setId && (
                        <span className="h-2 w-2 rounded-full bg-[var(--brand-red)]" title="Live" />
                      )}
                    </div>
                    {d.slides.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No slides.</p>
                    ) : (
                      <SlideGridForPresenter
                        phytoSet={d}
                        live={live}
                        grouped={groupView && (d.kind === "song" || d.kind === "scripture")}
                      />
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </main>

        {/* Right rail */}
        <aside className="h-[calc(100vh-73px)] space-y-4 overflow-auto border-l border-foreground/10 bg-background p-4 md:sticky md:top-[73px]">
          <div>
            <div className="mono mb-2 text-[10px] uppercase tracking-wider">Live output</div>
            <div className="relative overflow-hidden rounded-lg bg-[var(--brand-black)]">
              {liveSet?.kind === "media" ? (
                <DissolveSlide slide={liveSlide} variant="preview" durationMs={liveSet.dissolveMs ?? 0} template={liveSet.template} />
              ) : (
                <SlideView
                  slide={liveSlide}
                  variant="preview"
                  template={liveSet?.kind === "song" ? effectiveSongTemplate : liveSet?.template}
                />
              )}
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
                BLACKOUT
              </div>
            </div>
            {liveSet && liveSlide && (
              <p className="mono mt-2 text-xs text-muted-foreground">
                {liveSet.name} · {liveSet.slides.findIndex((s) => s.id === liveSlide.id) + 1}
              </p>
            )}
          </div>

          {liveSet?.kind === "media" && (
            <div className="rounded-2xl border border-foreground p-4">
              <div className="mono mb-3 text-[10px] uppercase tracking-wider">Media functions</div>
              <MediaPlaybackControls setId={liveSet.id} />
            </div>
          )}

          {liveSet?.kind === "song" && <SongTemplateEditor />}

          <div className="rounded-2xl border border-foreground">
            <button
              onClick={() => setShortcutsOpen((v) => !v)}
              className="mono flex w-full items-center justify-between px-4 py-3 text-sm"
            >
              <span>Shortcuts</span>
              {shortcutsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {shortcutsOpen && (
              <div className="mono space-y-1 border-t border-foreground/20 px-4 py-3 text-xs text-muted-foreground">
                <div>→ / Space — next slide</div>
                <div>← — previous slide</div>
                <div>Esc — stop (fade to black)</div>
                
              </div>
            )}
          </div>
        </aside>
      </div>

      <MediaAutoAdvance />
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
  const dissolve = phytoSet.dissolveMs ?? 0;
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
        <span className="mono text-[10px] uppercase tracking-wider">Fade duration</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={dissolve ? (dissolve / 1000).toString() : ""}
            placeholder="0"
            onChange={(e) => {
              const n = Math.min(2, Math.max(0, Number(e.target.value) || 0));
              updateSet(setId, { dissolveMs: Math.round(n * 1000) });
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
  const template = phytoSet.kind === "song" ? (songDraft ?? songTemplate) : phytoSet.template;
  return (
    <button
      onClick={() => live.go(phytoSet.id, slide.id)}
      className={`group relative overflow-hidden rounded-lg border-2 text-left transition ${
        isLive
          ? "border-[var(--brand-red)]"
          : "border-transparent hover:border-foreground"
      }`}
    >
      <SlideView slide={slide} variant="thumb" template={template} />
      <div className="mono absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white">
        {isLive && (
          <span className="h-2 w-2 rounded-full bg-[var(--brand-red)]" />
        )}
        {index + 1}
      </div>
      {slide.reference && phytoSet.kind === "scripture" && (
        <div className="mono absolute bottom-1.5 left-1.5 right-1.5 truncate rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">
          {slide.reference}
        </div>
      )}
    </button>
  );
}

function SlideGridForPresenter({ phytoSet, live, grouped }: { phytoSet: PhytoSet; live: LiveApi; grouped: boolean }) {
  if (!grouped) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {phytoSet.slides.map((s, i) => (
          <PresenterThumb key={s.id} slide={s} index={i} phytoSet={phytoSet} live={live} />
        ))}
      </div>
    );
  }
  const groups: { label: string; items: { slide: Slide; index: number }[] }[] = [];
  let current = "Section";
  phytoSet.slides.forEach((s, i) => {
    const sec = sectionOf(s);
    if (sec) current = sec;
    const last = groups[groups.length - 1];
    if (!last || last.label !== current) groups.push({ label: current, items: [{ slide: s, index: i }] });
    else last.items.push({ slide: s, index: i });
  });
  return (
    <div className="space-y-5">
      {groups.map((g, gi) => (
        <section key={`${g.label}-${gi}`}>
          <h3 className="mono mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">{g.label}</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {g.items.map(({ slide, index }) => (
              <PresenterThumb key={slide.id} slide={slide} index={index} phytoSet={phytoSet} live={live} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "System", value: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" },
  { label: "Display", value: "'Times New Roman', Times, serif" },
  { label: "Mono", value: "'Courier New', Courier, monospace" },
];

function SongTemplateEditor() {
  const songTemplate = useLibrary((s) => s.songTemplate);
  const setSongTemplate = useLibrary((s) => s.setSongTemplate);
  const setPreviewDraft = useSongTemplateDraft((s) => s.setDraft);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    fontScale: songTemplate.fontScale ?? 1,
    fontFamily: songTemplate.fontFamily ?? FONT_OPTIONS[0].value,
    bg: (songTemplate.bg ?? "black") as "black" | "white",
  });

  useEffect(() => {
    if (!open) {
      setDraft({
        fontScale: songTemplate.fontScale ?? 1,
        fontFamily: songTemplate.fontFamily ?? FONT_OPTIONS[0].value,
        bg: (songTemplate.bg ?? "black") as "black" | "white",
      });
    }
  }, [songTemplate, open]);

  // Push draft into the global preview store whenever it changes while open.
  useEffect(() => {
    if (open) setPreviewDraft(draft);
    else setPreviewDraft(null);
  }, [open, draft, setPreviewDraft]);

  // Always clear preview on unmount so leaving the page doesn't strand a draft.
  useEffect(() => () => setPreviewDraft(null), [setPreviewDraft]);

  const label = "Edit Song Template";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mono pill flex w-full items-center justify-center border border-foreground px-4 py-2 text-sm transition hover:bg-foreground hover:text-background"
      >
        {label}
      </button>
    );
  }

  const apply = () => {
    setSongTemplate({ ...draft });
    setPreviewDraft(null);
    setOpen(false);
  };

  const cancel = () => {
    setPreviewDraft(null);
    setOpen(false);
  };

  return (
    <div className="rounded-2xl border border-foreground p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="mono text-[10px] uppercase tracking-wider">{label}</div>
        <button
          onClick={cancel}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <div className="space-y-4 text-sm">
        <div>
          <div className="mono mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider">
            <span>Font size</span>
            <span className="text-muted-foreground">{draft.fontScale.toFixed(2)}×</span>
          </div>
          <input
            type="range"
            min={1}
            max={2}
            step={0.05}
            value={draft.fontScale}
            onChange={(e) =>
              setDraft((d) => ({ ...d, fontScale: Number(e.target.value) }))
            }
            className="w-full"
          />
        </div>

        <div>
          <div className="mono mb-2 text-[10px] uppercase tracking-wider">Font type</div>
          <div className="grid grid-cols-1 gap-1">
            {FONT_OPTIONS.map((f) => {
              const active = draft.fontFamily === f.value;
              return (
                <button
                  key={f.label}
                  onClick={() => setDraft((d) => ({ ...d, fontFamily: f.value }))}
                  style={{ fontFamily: f.value }}
                  className={`rounded-lg border px-3 py-1.5 text-left text-sm transition ${
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/20 hover:border-foreground"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mono mb-2 text-[10px] uppercase tracking-wider">Background</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setDraft((d) => ({ ...d, bg: "black" }))}
              className={`rounded-lg border px-3 py-2 text-xs transition ${
                draft.bg === "black"
                  ? "border-foreground bg-black text-white"
                  : "border-foreground/20 bg-black text-white/60 hover:border-foreground"
              }`}
            >
              Black
            </button>
            <button
              onClick={() => setDraft((d) => ({ ...d, bg: "white" }))}
              className={`rounded-lg border px-3 py-2 text-xs transition ${
                draft.bg === "white"
                  ? "border-foreground bg-white text-black"
                  : "border-foreground/20 bg-white text-black/60 hover:border-foreground"
              }`}
            >
              White
            </button>
          </div>
        </div>

        <button
          onClick={apply}
          className="pill flex w-full items-center justify-center border border-foreground bg-foreground px-4 py-2 text-sm text-background transition hover:opacity-90"
        >
          Apply to all songs
        </button>
      </div>
    </div>
  );
}
