import { createFileRoute, Link } from "@tanstack/react-router";
import { useLibrary, useLive } from "@/lib/store";
import { SlideView, DissolveSlide } from "@/components/SlideView";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Monitor,
  Square,
  X,
  Search,
  Repeat,
  Timer,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Deck, Slide } from "@/lib/types";
import { z } from "zod";

type LiveApi = ReturnType<typeof useLive.getState>;


const searchSchema = z.object({
  deck: z.string().optional(),
  playlist: z.string().optional(),
});

export const Route = createFileRoute("/present")({
  validateSearch: searchSchema,
  component: Presenter,
});

function Presenter() {
  const { deck: deckFromUrl, playlist: playlistFromUrl } = Route.useSearch();
  const decks = useLibrary((s) => s.decks);
  const order = useLibrary((s) => s.order);
  const playlists = useLibrary((s) => s.playlists);
  const playlistOrder = useLibrary((s) => s.playlistOrder);
  const addDeckToPlaylist = useLibrary((s) => s.addDeckToPlaylist);
  const removeDeckFromPlaylist = useLibrary((s) => s.removeDeckFromPlaylist);
  const reorderPlaylistDecks = useLibrary((s) => s.reorderPlaylistDecks);
  const live = useLive();

  const activePlaylist = playlistFromUrl ? playlists[playlistFromUrl] : null;

  // The list of decks shown in the sidebar.
  const deckList = activePlaylist
    ? activePlaylist.deckIds.filter((id) => decks[id])
    : order;

  const [activeDeckId, setActiveDeckId] = useState<string | null>(
    deckFromUrl ?? deckList[0] ?? null
  );
  const [query, setQuery] = useState("");
  const [groupView, setGroupView] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dragOverPlaylist, setDragOverPlaylist] = useState<string | null>(null);
  const [reorderDragIndex, setReorderDragIndex] = useState<number | null>(null);
  const [reorderOverIndex, setReorderOverIndex] = useState<number | null>(null);
  
  
  

  // Only follow URL changes (not internal clicks).
  useEffect(() => {
    if (deckFromUrl) setActiveDeckId(deckFromUrl);
  }, [deckFromUrl]);
  useEffect(() => {
    if (activePlaylist && !activeDeckId) {
      setActiveDeckId(activePlaylist.deckIds[0] ?? null);
    }
  }, [activePlaylist, activeDeckId]);

  const activeDeck = activeDeckId ? decks[activeDeckId] : null;
  const liveDeck = live.deckId ? decks[live.deckId] : null;
  const liveSlide = useMemo(
    () => liveDeck?.slides.find((s) => s.id === live.slideId) ?? null,
    [liveDeck, live.slideId]
  );

  // Filter both lists when in "all" mode.
  const q = query.trim().toLowerCase();
  const showAll = !activePlaylist;
  const filteredDecks = deckList.filter(
    (id) => !q || decks[id]?.name.toLowerCase().includes(q)
  );
  const filteredPlaylists = showAll ? playlistOrder : [];

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!liveDeck || !liveSlide) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const idx = liveDeck.slides.findIndex((s) => s.id === liveSlide.id);
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        const next = liveDeck.slides[idx + 1];
        if (next) live.go(liveDeck.id, next.id);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        const prev = liveDeck.slides[idx - 1];
        if (prev) live.go(liveDeck.id, prev.id);
      } else if (e.key.toLowerCase() === "b") {
        live.toggleBlackout();
      } else if (e.key === "Escape") {
        live.clearLive();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [liveDeck, liveSlide, live]);

  const openOutput = () => {
    window.open("/output", "_blank", "noopener,noreferrer");
  };


  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Sticky header keeps top toolbar visible while presenting. */}
      <header className="sticky top-0 z-30 border-b border-border bg-background">
        <div className="flex items-center justify-between gap-4 px-4 py-2">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSidebarOpen((v) => !v)}
              title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="mr-1 h-4 w-4" />
              ) : (
                <PanelLeftOpen className="mr-1 h-4 w-4" />
              )}
              {sidebarOpen ? "Hide" : "Show"} sidebar
            </Button>
            <span className="text-sm font-medium">Presenter</span>
          </div>
          <div className="flex items-center gap-2">
            {liveDeck?.kind === "media" && <MediaPlaybackControls deckId={liveDeck.id} />}
            <Button size="sm" variant="outline" onClick={openOutput}>
              <Monitor className="mr-1 h-4 w-4" /> Output window
            </Button>
            <label className="flex items-center gap-1 rounded-md border border-border bg-card/60 px-2 py-1 text-xs">
              <input
                type="checkbox"
                checked={(live.blackoutFadeMs ?? 0) > 0}
                onChange={(e) =>
                  live.setLive({ blackoutFadeMs: e.target.checked ? 600 : 0 })
                }
              />
              Fade
            </label>
            <Button
              size="sm"
              variant={live.blackout ? "default" : "outline"}
              onClick={() => live.toggleBlackout()}
              title="Blackout (B)"
            >
              <Square className="mr-1 h-4 w-4" /> Black
            </Button>
            <Button size="sm" variant="ghost" onClick={() => live.clearLive()} title="Stop (Esc)">
              <X className="mr-1 h-4 w-4" /> Stop
            </Button>

          </div>
        </div>
      </header>

      <div
        className={`grid flex-1 gap-0 ${
          sidebarOpen
            ? "md:grid-cols-[260px_1fr_340px]"
            : "md:grid-cols-[1fr_340px]"
        }`}
      >
        {/* Sidebar */}
        {sidebarOpen && (
        <aside className="flex max-h-[calc(100vh-49px)] flex-col border-r border-border bg-card/40 md:sticky md:top-[49px] md:self-start">
          <div className="border-b border-border p-3">
            {activePlaylist && (
              <div className="mb-2 flex items-center gap-2">
                <Link
                  to="/present"
                  className="rounded p-1 hover:bg-muted"
                  title="Back to all"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </Link>
                <h3 className="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {activePlaylist.name}
                </h3>
              </div>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sets"
                className="h-8 pl-7 text-sm"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto p-3">
            {showAll && filteredPlaylists.length > 0 && (
              <div className="mb-4">
                <div className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Gatherings
                </div>
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
                          if (e.dataTransfer.types.includes("application/x-deck-id")) {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "copy";
                            if (dragOverPlaylist !== pid) setDragOverPlaylist(pid);
                          }
                        }}
                        onDragLeave={() => {
                          if (dragOverPlaylist === pid) setDragOverPlaylist(null);
                        }}
                        onDrop={(e) => {
                          const deckId = e.dataTransfer.getData("application/x-deck-id");
                          setDragOverPlaylist(null);
                          if (!deckId) return;
                          e.preventDefault();
                          if (!p.deckIds.includes(deckId)) {
                            addDeckToPlaylist(pid, deckId);
                          }
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm transition hover:bg-muted ${
                          isDragOver ? "bg-primary/20 ring-1 ring-primary" : ""
                        }`}
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {p.deckIds.length}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <div className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Sets
              </div>
              <div className="space-y-1">
                {filteredDecks.length === 0 && (
                  <p className="px-2 text-xs text-muted-foreground">
                    {activePlaylist
                      ? "Gathering is empty."
                      : q
                      ? "No matches."
                      : "No sets yet."}
                  </p>
                )}
                {filteredDecks.map((id, i) => {
                  const d = decks[id];
                  if (!d) return null;
                  const isActive = id === activeDeckId;
                  const isLive = id === live.deckId;
                  const inGathering = !!activePlaylist;
                  const isReorderTarget =
                    inGathering && reorderOverIndex === i && reorderDragIndex !== null;
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
                        const ids = [...activePlaylist.deckIds];
                        const [moved] = ids.splice(reorderDragIndex, 1);
                        ids.splice(i, 0, moved);
                        reorderPlaylistDecks(activePlaylist.id, ids);
                        setReorderDragIndex(null);
                        setReorderOverIndex(null);
                      }}
                      className={isReorderTarget ? "rounded ring-1 ring-primary" : ""}
                    >
                      <button
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("application/x-deck-id", id);
                          e.dataTransfer.effectAllowed = inGathering ? "move" : "copy";
                          if (inGathering) setReorderDragIndex(i);
                        }}
                        onDragEnd={() => {
                          setReorderDragIndex(null);
                          setReorderOverIndex(null);
                        }}
                        onClick={() => {
                          setActiveDeckId(id);
                          if (activePlaylist) {
                            const el = document.getElementById(`deck-section-${id}`);
                            el?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm transition ${
                          isActive ? "bg-muted font-medium" : "hover:bg-muted/50"
                        }`}
                      >
                        <span className="truncate">
                          {inGathering && (
                            <span className="mr-1 text-xs text-muted-foreground">
                              {i + 1}.
                            </span>
                          )}
                          {d.name}
                        </span>
                        <span className="flex items-center gap-1">
                          {isLive && (
                            <span className="rounded bg-red-500 px-1.5 text-[10px] font-semibold text-white">
                              LIVE
                            </span>
                          )}
                          {inGathering && activePlaylist && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                removeDeckFromPlaylist(activePlaylist.id, i);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.stopPropagation();
                                  removeDeckFromPlaylist(activePlaylist.id, i);
                                }
                              }}
                              className="rounded p-0.5 text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground hover:opacity-100"
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

        {/* Slide grid */}
        <main className="overflow-auto p-4">
          {activePlaylist ? (
            deckList.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Gathering is empty. Drag sets here.
              </div>
            ) : (
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">{activePlaylist.name}</h2>
                <span className="text-xs text-muted-foreground">
                  Click any slide to send it live · ← → navigates
                </span>
              </div>
            )
          ) : !activeDeck ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a set to begin.
            </div>
          ) : activeDeck.slides.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              This set has no slides.{" "}
              <Link
                to="/deck/$deckId"
                params={{ deckId: activeDeck.id }}
                className="ml-1 underline"
              >
                Edit
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold">{activeDeck.name}</h2>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/deck/$deckId" params={{ deckId: activeDeck.id }}>
                      Edit set
                    </Link>
                  </Button>
                  {(activeDeck.kind === "song" || activeDeck.kind === "scripture") && (
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={groupView}
                        onChange={(e) => setGroupView(e.target.checked)}
                      />
                      Group by section
                    </label>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  Click any slide to send it live · ← → navigates
                </span>
              </div>
              <SlideGridForPresenter
                deck={activeDeck}
                live={live}
                grouped={groupView && (activeDeck.kind === "song" || activeDeck.kind === "scripture")}
              />
            </>
          )}

          {activePlaylist && deckList.length > 0 && (
            <div className="space-y-8">
              {deckList.map((id, i) => {
                const d = decks[id];
                if (!d) return null;
                return (
                  <section key={id} id={`deck-section-${id}`}>
                    <div className="mb-2 flex items-center gap-3">
                      <h3 className="text-base font-semibold">
                        <span className="mr-1 text-muted-foreground">{i + 1}.</span>
                        {d.name}
                      </h3>
                      <Button asChild size="sm" variant="outline">
                        <Link to="/deck/$deckId" params={{ deckId: d.id }}>
                          Edit set
                        </Link>
                      </Button>
                      {id === live.deckId && (
                        <span className="rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          LIVE
                        </span>
                      )}
                    </div>
                    {d.slides.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No slides.</p>
                    ) : (
                      <SlideGridForPresenter
                        deck={d}
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

        {/* Live preview */}
        <aside className="max-h-[calc(100vh-49px)] overflow-auto border-l border-border bg-card/40 p-3 md:sticky md:top-[49px] md:self-start">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Live output
          </h3>
          <Card className="relative overflow-hidden p-0">
            {liveDeck?.kind === "media" ? (
              <DissolveSlide
                slide={liveSlide}
                variant="preview"
                durationMs={liveDeck.dissolveMs ?? 0}
              />
            ) : (
              <SlideView slide={liveSlide} variant="preview" />
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
          </Card>
          {liveDeck && liveSlide && (
            <p className="mt-2 text-xs text-muted-foreground">
              {liveDeck.name} ·{" "}
              {liveDeck.slides.findIndex((s) => s.id === liveSlide.id) + 1} /{" "}
              {liveDeck.slides.length}
            </p>
          )}

          <div className="mt-4 rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">
            <div className="mb-1 font-medium text-foreground">Shortcuts</div>
            <div>→ / Space — next slide</div>
            <div>← — previous slide</div>
            <div>B — blackout · Esc — stop</div>
          </div>
        </aside>
      </div>

      {/* Drives auto-advance for media decks while presenting. */}
      <MediaAutoAdvance />
    </div>
  );
}

function MediaAutoAdvance() {
  const deckId = useLive((s) => s.deckId);
  const slideId = useLive((s) => s.slideId);
  const blackout = useLive((s) => s.blackout);
  const deck = useLibrary((s) => (deckId ? s.decks[deckId] : null));
  useEffect(() => {
    if (!deck || deck.kind !== "media") return;
    const ms = deck.autoAdvanceMs ?? 0;
    if (ms <= 0 || !slideId || blackout) return;
    const idx = deck.slides.findIndex((s) => s.id === slideId);
    if (idx === -1) return;
    const t = setTimeout(() => {
      const go = useLive.getState().go;
      const next = deck.slides[idx + 1];
      if (next) go(deck.id, next.id);
      else if (deck.loop && deck.slides[0]) go(deck.id, deck.slides[0].id);
    }, ms);
    return () => clearTimeout(t);
  }, [deck, slideId, blackout]);
  return null;
}


function MediaPlaybackControls({ deckId }: { deckId: string }) {
  const deck = useLibrary((s) => s.decks[deckId]);
  const updateDeck = useLibrary((s) => s.updateDeck);
  if (!deck) return null;
  const auto = deck.autoAdvanceMs ?? 0;
  const dissolve = deck.dissolveMs ?? 0;
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card/60 px-2 py-1 text-xs">
      <Timer className="h-3.5 w-3.5 text-muted-foreground" />
      <label className="flex items-center gap-1">
        Auto
        <input
          type="number"
          min={0}
          step={0.5}
          value={auto ? (auto / 1000).toString() : ""}
          placeholder="off"
          onChange={(e) => {
            const n = Number(e.target.value);
            updateDeck(deckId, { autoAdvanceMs: n > 0 ? Math.round(n * 1000) : 0 });
          }}
          className="h-6 w-14 rounded border border-input bg-background px-1"
        />
        s
      </label>
      <button
        type="button"
        onClick={() => updateDeck(deckId, { loop: !deck.loop })}
        className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${deck.loop ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
        title="Loop"
      >
        <Repeat className="h-3 w-3" /> Loop
      </button>
      <label className="flex items-center gap-1">
        Fade
        <input
          type="number"
          min={0}
          max={2}
          step={0.1}
          value={dissolve ? (dissolve / 1000).toString() : ""}
          placeholder="0"
          onChange={(e) => {
            const n = Math.min(2, Math.max(0, Number(e.target.value) || 0));
            updateDeck(deckId, { dissolveMs: Math.round(n * 1000) });
          }}
          className="h-6 w-12 rounded border border-input bg-background px-1"
        />
        s
      </label>
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

function PresenterThumb({
  slide,
  index,
  deck,
  live,
}: {
  slide: Slide;
  index: number;
  deck: Deck;
  live: LiveApi;
}) {
  const isLive = live.deckId === deck.id && live.slideId === slide.id;
  return (
    <button
      onClick={() => live.go(deck.id, slide.id)}
      className={`group relative rounded-md border-2 text-left transition ${
        isLive
          ? "border-red-500 ring-2 ring-red-500/30"
          : "border-transparent hover:border-primary"
      }`}
    >
      <SlideView slide={slide} variant="thumb" className="rounded" />
      <div className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
        {index + 1}
      </div>
      {slide.reference && deck.kind === "scripture" && (
        <div className="absolute bottom-1 left-1 right-1 truncate rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
          {slide.reference}
        </div>
      )}
      {isLive && (
        <div className="absolute right-1 top-1 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          LIVE
        </div>
      )}
    </button>
  );
}

function SlideGridForPresenter({
  deck,
  live,
  grouped,
}: {
  deck: Deck;
  live: LiveApi;
  grouped: boolean;
}) {
  if (!grouped) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {deck.slides.map((s, i) => (
          <PresenterThumb key={s.id} slide={s} index={i} deck={deck} live={live} />
        ))}
      </div>
    );
  }

  // Build groups carrying each slide's original index so live navigation stays correct.
  const groups: { label: string; items: { slide: Slide; index: number }[] }[] = [];
  let current = "Section";
  deck.slides.forEach((s, i) => {
    const sec = sectionOf(s);
    if (sec) current = sec;
    const last = groups[groups.length - 1];
    if (!last || last.label !== current) {
      groups.push({ label: current, items: [{ slide: s, index: i }] });
    } else {
      last.items.push({ slide: s, index: i });
    }
  });

  return (
    <div className="space-y-5">
      {groups.map((g, gi) => (
        <section key={`${g.label}-${gi}`}>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {g.label}
          </h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {g.items.map(({ slide, index }) => (
              <PresenterThumb
                key={slide.id}
                slide={slide}
                index={index}
                deck={deck}
                live={live}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}


