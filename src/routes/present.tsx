import { createFileRoute, Link } from "@tanstack/react-router";
import { useLibrary, useLive } from "@/lib/store";
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
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Deck, DeckKind, Slide } from "@/lib/types";
import { z } from "zod";


type LiveApi = ReturnType<typeof useLive.getState>;

function kindBadgeBg(kind: DeckKind): string {
  if (kind === "song") return "bg-[var(--brand-blue)] text-[var(--brand-white)]";
  if (kind === "scripture") return "bg-[var(--brand-green)] text-[var(--brand-white)]";
  if (kind === "media") return "bg-[var(--brand-orange)] text-[var(--brand-white)]";
  return "bg-muted text-foreground";
}

function KindBadge({ kind }: { kind: DeckKind }) {
  return (
    <span className={`pill mono px-2 py-0.5 text-[10px] uppercase tracking-wider ${kindBadgeBg(kind)}`}>
      {kind === "mixed" ? "Mixed" : kind}
    </span>
  );
}

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
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

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

  const q = query.trim().toLowerCase();
  const showAll = !activePlaylist;
  const filteredDecks = deckList.filter(
    (id) => !q || decks[id]?.name.toLowerCase().includes(q)
  );
  const filteredPlaylists = showAll ? playlistOrder : [];

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
      } else if (e.key === "Escape") {
        live.clearLive();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [liveDeck, liveSlide, live]);

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
              title="Create"
              aria-label="Create"
            >
              <Plus className="h-5 w-5" />
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

          <div className="flex flex-col items-end gap-2 justify-self-end">
            <button
              onClick={openOutput}
              className="pill flex items-center gap-2 border border-foreground px-5 py-2 text-sm transition hover:bg-foreground hover:text-background"
              title="Output window"
            >
              Output <ArrowUpRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => live.clearLive()}
              className="pill flex h-9 w-9 items-center justify-center border border-foreground text-muted-foreground transition hover:bg-[var(--brand-red)] hover:text-[var(--brand-white)] hover:border-[var(--brand-red)]"
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
                            if (!p.deckIds.includes(deckId)) addDeckToPlaylist(pid, deckId);
                          }}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-muted ${
                            isDragOver ? "bg-foreground/10 ring-1 ring-foreground" : ""
                          }`}
                        >
                          <span className="truncate">{p.name}</span>
                          <span className="mono text-[10px] text-muted-foreground">{p.deckIds.length}</span>
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
                  {filteredDecks.length === 0 && (
                    <p className="px-2 text-xs text-muted-foreground">
                      {activePlaylist ? "Gathering is empty." : q ? "No matches." : "No sets yet."}
                    </p>
                  )}
                  {filteredDecks.map((id, i) => {
                    const d = decks[id];
                    if (!d) return null;
                    const isActive = id === activeDeckId;
                    const isLive = id === live.deckId;
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
                          const ids = [...activePlaylist.deckIds];
                          const [moved] = ids.splice(reorderDragIndex, 1);
                          ids.splice(i, 0, moved);
                          reorderPlaylistDecks(activePlaylist.id, ids);
                          setReorderDragIndex(null);
                          setReorderOverIndex(null);
                        }}
                        className={isReorderTarget ? "rounded-lg ring-1 ring-foreground" : ""}
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
                          className={`flex w-full items-center justify-between gap-2 rounded-lg border-2 px-2 py-1.5 text-left text-sm transition ${
                            isLive
                              ? "border-[var(--brand-red)]"
                              : isActive
                              ? "border-transparent bg-muted"
                              : "border-transparent hover:bg-muted/50"
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
                                  removeDeckFromPlaylist(activePlaylist.id, i);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.stopPropagation();
                                    removeDeckFromPlaylist(activePlaylist.id, i);
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
            deckList.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Gathering is empty. Drag sets here.
              </div>
            ) : null
          ) : !activeDeck ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a set to begin.
            </div>
          ) : activeDeck.slides.length === 0 ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              This set has no slides.
              <Link
                to="/deck/$deckId"
                params={{ deckId: activeDeck.id }}
                className="underline"
                title="Edit set"
              >
                <Pencil className="inline h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-2xl">{activeDeck.name}</h2>
                <KindBadge kind={activeDeck.kind} />
                <Link
                  to="/deck/$deckId"
                  params={{ deckId: activeDeck.id }}
                  className="pill flex h-8 w-8 items-center justify-center border border-foreground transition hover:bg-foreground hover:text-background"
                  title="Edit set"
                  aria-label="Edit set"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
                {(activeDeck.kind === "song" || activeDeck.kind === "scripture") && (
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
                      <h3 className="text-lg">
                        <span className="mono mr-2 text-sm text-muted-foreground">{i + 1}.</span>
                        {d.name}
                      </h3>
                      <KindBadge kind={d.kind} />
                      <Link
                        to="/deck/$deckId"
                        params={{ deckId: d.id }}
                        className="pill flex h-7 w-7 items-center justify-center border border-foreground transition hover:bg-foreground hover:text-background"
                        title="Edit set"
                        aria-label="Edit set"
                      >
                        <Pencil className="h-3 w-3" />
                      </Link>
                      {id === live.deckId && (
                        <span className="h-2 w-2 rounded-full bg-[var(--brand-red)]" title="Live" />
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

        {/* Right rail */}
        <aside className="h-[calc(100vh-73px)] space-y-4 overflow-auto border-l border-foreground/10 bg-background p-4 md:sticky md:top-[73px]">
          <div>
            <div className="mono mb-2 text-[10px] uppercase tracking-wider">Live output</div>
            <div className="relative overflow-hidden rounded-2xl bg-[var(--brand-black)]">
              {liveDeck?.kind === "media" ? (
                <DissolveSlide slide={liveSlide} variant="preview" durationMs={liveDeck.dissolveMs ?? 0} />
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
            </div>
            {liveDeck && liveSlide && (
              <p className="mono mt-2 text-xs text-muted-foreground">
                {liveDeck.name} · {liveDeck.slides.findIndex((s) => s.id === liveSlide.id) + 1} / {liveDeck.slides.length}
              </p>
            )}
          </div>

          {liveDeck?.kind === "media" && (
            <div className="rounded-2xl border border-foreground p-4">
              <div className="mono mb-3 text-[10px] uppercase tracking-wider">Media functions</div>
              <MediaPlaybackControls deckId={liveDeck.id} />
            </div>
          )}

          <div className="rounded-2xl border border-foreground">
            <button
              onClick={() => setShortcutsOpen((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm"
            >
              <span>Shortcuts</span>
              {shortcutsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {shortcutsOpen && (
              <div className="mono space-y-1 border-t border-foreground/20 px-4 py-3 text-xs text-muted-foreground">
                <div>→ / Space — next slide</div>
                <div>← — previous slide</div>
                <div>Esc — stop (fade to black)</div>
                <div>Esc — stop</div>
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
              updateDeck(deckId, { autoAdvanceMs: n > 0 ? Math.round(n * 1000) : 0 });
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
              updateDeck(deckId, { dissolveMs: Math.round(n * 1000) });
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
          checked={!!deck.loop}
          onChange={(e) => updateDeck(deckId, { loop: e.target.checked })}
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

function PresenterThumb({ slide, index, deck, live }: { slide: Slide; index: number; deck: Deck; live: LiveApi }) {
  const isLive = live.deckId === deck.id && live.slideId === slide.id;
  return (
    <button
      onClick={() => live.go(deck.id, slide.id)}
      className={`group relative overflow-hidden rounded-lg border-2 text-left transition ${
        isLive
          ? "border-[var(--brand-red)]"
          : "border-transparent hover:border-foreground"
      }`}
    >
      <SlideView slide={slide} variant="thumb" />
      <div className="mono absolute left-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">
        {index + 1}
      </div>
      {slide.reference && deck.kind === "scripture" && (
        <div className="mono absolute bottom-1.5 left-1.5 right-1.5 truncate rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">
          {slide.reference}
        </div>
      )}
      {isLive && (
        <div className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--brand-red)]" />
      )}
    </button>
  );
}

function SlideGridForPresenter({ deck, live, grouped }: { deck: Deck; live: LiveApi; grouped: boolean }) {
  if (!grouped) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {deck.slides.map((s, i) => (
          <PresenterThumb key={s.id} slide={s} index={i} deck={deck} live={live} />
        ))}
      </div>
    );
  }
  const groups: { label: string; items: { slide: Slide; index: number }[] }[] = [];
  let current = "Section";
  deck.slides.forEach((s, i) => {
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
              <PresenterThumb key={slide.id} slide={slide} index={index} deck={deck} live={live} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
