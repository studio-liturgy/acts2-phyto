import { createFileRoute, Link } from "@tanstack/react-router";
import { useLibrary, useLive } from "@/lib/store";
import { SlideView } from "@/components/SlideView";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Monitor, Square, EyeOff, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

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
  const live = useLive();

  const activePlaylist = playlistFromUrl ? playlists[playlistFromUrl] : null;
  const deckList = activePlaylist
    ? activePlaylist.deckIds.filter((id) => decks[id])
    : order;

  const [activeDeckId, setActiveDeckId] = useState<string | null>(
    deckFromUrl ?? deckList[0] ?? null
  );

  useEffect(() => {
    if (deckFromUrl) setActiveDeckId(deckFromUrl);
    else if (activePlaylist && !activeDeckId) setActiveDeckId(activePlaylist.deckIds[0] ?? null);
  }, [deckFromUrl, activePlaylist, activeDeckId]);

  const activeDeck = activeDeckId ? decks[activeDeckId] : null;
  const liveDeck = live.deckId ? decks[live.deckId] : null;
  const liveSlide = useMemo(
    () => liveDeck?.slides.find((s) => s.id === live.slideId) ?? null,
    [liveDeck, live.slideId]
  );

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
      } else if (e.key.toLowerCase() === "c") {
        live.toggleClear();
      } else if (e.key === "Escape") {
        live.clearLive();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [liveDeck, liveSlide, live]);

  const openOutput = () => {
    window.open("/output", "stage-output", "width=1280,height=720");
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="flex items-center justify-between gap-4 px-4 py-2">
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="ghost">
              <Link to="/">
                <ArrowLeft className="mr-1 h-4 w-4" /> Library
              </Link>
            </Button>
            <span className="text-sm font-medium">Presenter</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={openOutput}>
              <Monitor className="mr-1 h-4 w-4" /> Output window
            </Button>
            <Button
              size="sm"
              variant={live.blackout ? "default" : "outline"}
              onClick={() => live.toggleBlackout()}
              title="Blackout (B)"
            >
              <Square className="mr-1 h-4 w-4" /> Black
            </Button>
            <Button
              size="sm"
              variant={live.clear ? "default" : "outline"}
              onClick={() => live.toggleClear()}
              title="Clear (C)"
            >
              <EyeOff className="mr-1 h-4 w-4" /> Clear
            </Button>
            <Button size="sm" variant="ghost" onClick={() => live.clearLive()} title="Stop (Esc)">
              <X className="mr-1 h-4 w-4" /> Stop
            </Button>
          </div>
        </div>
      </header>

      <div className="grid flex-1 gap-0 lg:grid-cols-[260px_1fr_360px]">
        {/* Deck list */}
        <aside className="border-r border-border bg-card/40 p-3">
          <h3 className="mb-2 flex items-center justify-between px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>{activePlaylist ? activePlaylist.name : "Decks"}</span>
            {activePlaylist && (
              <Link to="/present" className="text-[10px] normal-case text-primary hover:underline">
                all decks
              </Link>
            )}
          </h3>
          <div className="space-y-1">
            {deckList.length === 0 && (
              <p className="px-2 text-xs text-muted-foreground">
                {activePlaylist ? "Playlist is empty." : "No decks. Create some first."}
              </p>
            )}
            {deckList.map((id, i) => {
              const d = decks[id];
              if (!d) return null;
              const isActive = id === activeDeckId;
              const isLive = id === live.deckId;
              return (
                <button
                  key={id}
                  onClick={() => setActiveDeckId(id)}
                  className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm transition ${
                    isActive ? "bg-muted font-medium" : "hover:bg-muted/50"
                  }`}
                >
                  <span className="truncate">
                    {activePlaylist && (
                      <span className="mr-1 text-xs text-muted-foreground">{i + 1}.</span>
                    )}
                    {d.name}
                  </span>
                  {isLive && (
                    <span className="rounded bg-red-500 px-1.5 text-[10px] font-semibold text-white">
                      LIVE
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Slide grid — non-chronological jumping */}
        <main className="overflow-auto p-4">
          {!activeDeck ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a deck to begin.
            </div>
          ) : activeDeck.slides.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              This deck has no slides. <Link to="/deck/$deckId" params={{ deckId: activeDeck.id }} className="ml-1 underline">Edit</Link>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">{activeDeck.name}</h2>
                <span className="text-xs text-muted-foreground">
                  Click any slide to send it live · ← → navigates
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {activeDeck.slides.map((s, i) => {
                  const isLive = live.deckId === activeDeck.id && live.slideId === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => live.go(activeDeck.id, s.id)}
                      className={`group relative rounded-md border-2 text-left transition ${
                        isLive
                          ? "border-red-500 ring-2 ring-red-500/30"
                          : "border-transparent hover:border-primary"
                      }`}
                    >
                      <SlideView slide={s} variant="thumb" className="rounded" />
                      <div className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                        {i + 1}
                      </div>
                      {s.reference && (
                        <div className="absolute bottom-1 left-1 right-1 truncate rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                          {s.reference}
                        </div>
                      )}
                      {isLive && (
                        <div className="absolute right-1 top-1 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          LIVE
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </main>

        {/* Live preview */}
        <aside className="border-l border-border bg-card/40 p-3">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Live output
          </h3>
          <Card className="overflow-hidden p-0">
            {live.blackout ? (
              <div className="flex aspect-video w-full items-center justify-center bg-black text-xs text-white/40">
                BLACKOUT
              </div>
            ) : live.clear ? (
              <div className="flex aspect-video w-full items-center justify-center bg-black text-xs text-white/40">
                CLEAR
              </div>
            ) : (
              <SlideView slide={liveSlide} variant="preview" />
            )}
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
            <div>B — blackout · C — clear · Esc — stop</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
