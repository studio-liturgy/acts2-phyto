import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLibrary } from "@/lib/store";
import { parseLyrics, fileToDataUrl, scriptureToSlides } from "@/lib/parsers";
import { fetchScriptureBolls, TRANSLATIONS } from "@/lib/bible";
import { searchSongs, fetchLyrics, type SongResult } from "@/lib/songs";
import { SlideView } from "@/components/SlideView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Plus, Trash2, GripVertical, Search, Loader2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { Slide, DeckKind } from "@/lib/types";

export const Route = createFileRoute("/deck/$deckId")({
  component: DeckEditor,
});

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function DeckEditor() {
  const { deckId } = Route.useParams();
  const navigate = useNavigate();
  const deck = useLibrary((s) => s.decks[deckId]);
  const { updateDeck, addSlide, updateSlide, removeSlide, reorderSlides } = useLibrary();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => deck?.slides.find((s) => s.id === selectedId) ?? deck?.slides[0] ?? null,
    [deck, selectedId]
  );

  if (!deck) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">Deck not found.</p>
          <Button asChild variant="link">
            <Link to="/">Back to library</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <Button asChild size="sm" variant="ghost">
              <Link to="/">
                <ArrowLeft className="mr-1 h-4 w-4" /> Library
              </Link>
            </Button>
            <Input
              value={deck.name}
              onChange={(e) => updateDeck(deck.id, { name: e.target.value })}
              className="h-8 w-64 font-medium"
            />
            <span className="text-xs capitalize text-muted-foreground">{deck.kind}</span>
          </div>
          <Button onClick={() => navigate({ to: "/present", search: { deck: deck.id } })}>
            Present
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[1fr_320px]">
        {/* Main: importers + slide list */}
        <div className="space-y-6">
          <Importers deckId={deck.id} kind={deck.kind} />

          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Slides ({deck.slides.length})
              </h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  addSlide(deck.id, { id: uid(), kind: "blank", lines: [""] } as Slide)
                }
              >
                <Plus className="mr-1 h-3 w-3" /> Add blank
              </Button>
            </div>
            {deck.slides.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No slides yet. Use an importer above.
              </p>
            ) : (
              <SlideGrid
                deckId={deck.id}
                slides={deck.slides}
                selectedId={selected?.id ?? null}
                onSelect={setSelectedId}
                onRemove={(id) => removeSlide(deck.id, id)}
                onReorder={(ids) => reorderSlides(deck.id, ids)}
              />
            )}
          </Card>
        </div>

        {/* Sidebar: inspector */}
        <aside className="space-y-4">
          <Card className="p-4">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Preview
            </h3>
            <SlideView slide={selected} variant="preview" className="rounded" />
          </Card>
          {selected && (
            <Card className="space-y-3 p-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Edit slide
              </h3>
              <div>
                <Label className="text-xs">Reference / label</Label>
                <Input
                  value={selected.reference ?? ""}
                  onChange={(e) =>
                    updateSlide(deck.id, selected.id, { reference: e.target.value })
                  }
                  placeholder="e.g. Chorus, John 3:16"
                />
              </div>
              <div>
                <Label className="text-xs">Lines (one per line)</Label>
                <Textarea
                  rows={5}
                  value={selected.lines?.join("\n") ?? ""}
                  onChange={(e) =>
                    updateSlide(deck.id, selected.id, {
                      lines: e.target.value.split("\n"),
                    })
                  }
                />
              </div>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function SlideGrid({
  deckId: _deckId,
  slides,
  selectedId,
  onSelect,
  onRemove,
  onReorder,
}: {
  deckId: string;
  slides: Slide[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (ids: string[]) => void;
}) {
  const dragId = useRef<string | null>(null);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {slides.map((s, i) => (
        <div
          key={s.id}
          draggable
          onDragStart={() => (dragId.current = s.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            const from = dragId.current;
            dragId.current = null;
            if (!from || from === s.id) return;
            const ids = slides.map((x) => x.id);
            const fromIdx = ids.indexOf(from);
            const toIdx = ids.indexOf(s.id);
            ids.splice(toIdx, 0, ids.splice(fromIdx, 1)[0]);
            onReorder(ids);
          }}
          onClick={() => onSelect(s.id)}
          className={`group relative cursor-pointer rounded-md border-2 transition ${
            selectedId === s.id ? "border-primary" : "border-transparent hover:border-border"
          }`}
        >
          <SlideView slide={s} variant="thumb" className="rounded" />
          <div className="absolute left-1 top-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
            <GripVertical className="h-3 w-3" /> {i + 1}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(s.id);
            }}
            className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
            aria-label="Remove slide"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function Importers({ deckId, kind }: { deckId: string; kind: DeckKind }) {
  const { addSlide, updateDeck } = useLibrary();

  // Lyrics state
  const [lyrics, setLyrics] = useState("");
  const [linesPer, setLinesPer] = useState(2);

  // Song search state
  const [songQuery, setSongQuery] = useState("");
  const [songResults, setSongResults] = useState<SongResult[]>([]);
  const [songSearching, setSongSearching] = useState(false);
  const [songErr, setSongErr] = useState<string | null>(null);
  const [importingSong, setImportingSong] = useState<string | null>(null);

  // Scripture state
  const [ref, setRef] = useState("");
  const [translation, setTranslation] = useState("NIV");
  const [versesPer, setVersesPer] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const importLyrics = () => {
    const slides = parseLyrics(lyrics, linesPer);
    slides.forEach((s) => addSlide(deckId, s));
    setLyrics("");
  };

  const runSongSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!songQuery.trim()) return;
    setSongSearching(true);
    setSongErr(null);
    try {
      const results = await searchSongs(songQuery);
      setSongResults(results);
      if (results.length === 0) setSongErr("No matches found.");
    } catch (err) {
      setSongErr((err as Error).message);
    } finally {
      setSongSearching(false);
    }
  };

  const importSong = async (s: SongResult) => {
    const key = `${s.artist}::${s.title}`;
    setImportingSong(key);
    setSongErr(null);
    try {
      const lyricsText = await fetchLyrics(s.artist, s.title);
      const slides = parseLyrics(lyricsText, linesPer);
      slides.forEach((sl) => addSlide(deckId, sl));
      updateDeck(deckId, { name: `${s.title} — ${s.artist}` });
    } catch (err) {
      setSongErr(`${s.title}: ${(err as Error).message}`);
    } finally {
      setImportingSong(null);
    }
  };

  const importScripture = async () => {
    if (!ref.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const { reference, verses } = await fetchScriptureBolls(ref, translation);
      const slides = scriptureToSlides(reference, verses, versesPer);
      slides.forEach((s) => addSlide(deckId, s));
      setRef("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const importImages = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      const url = await fileToDataUrl(f);
      addSlide(deckId, { kind: "image", imageUrl: url, lines: [] });
    }
  };

  if (kind === "song") {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-medium">Search songs</h3>
          <form onSubmit={runSongSearch} className="flex gap-2">
            <Input
              value={songQuery}
              onChange={(e) => setSongQuery(e.target.value)}
              placeholder="Song title or artist…"
            />
            <Button size="sm" type="submit" disabled={songSearching || !songQuery.trim()}>
              {songSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </form>
          {songErr && <p className="mt-2 text-xs text-destructive">{songErr}</p>}
          <div className="mt-3 max-h-72 space-y-1 overflow-auto">
            {songResults.map((s) => {
              const key = `${s.artist}::${s.title}`;
              const loading = importingSong === key;
              return (
                <button
                  key={key}
                  onClick={() => importSong(s)}
                  disabled={loading}
                  className="flex w-full items-center gap-2 rounded p-2 text-left text-sm transition hover:bg-muted disabled:opacity-60"
                >
                  {s.albumCover ? (
                    <img src={s.albumCover} alt="" className="h-8 w-8 rounded" />
                  ) : (
                    <div className="h-8 w-8 rounded bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{s.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{s.artist}</div>
                  </div>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Plus className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Search powered by lyrics.ovh. Click to fetch lyrics & build slides.
          </p>
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 text-sm font-medium">Or paste lyrics</h3>
          <Textarea
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            rows={6}
            placeholder={`[Verse 1]\nAmazing grace, how sweet the sound\nThat saved a wretch like me\n\n[Chorus]\n...`}
            className="font-mono text-xs"
          />
          <div className="mt-2 flex items-center gap-2">
            <Label className="text-xs">Lines per slide</Label>
            <Input
              type="number"
              min={1}
              max={8}
              value={linesPer}
              onChange={(e) => setLinesPer(Math.max(1, Number(e.target.value) || 1))}
              className="h-8 w-16"
            />
            <Button size="sm" className="ml-auto" onClick={importLyrics} disabled={!lyrics.trim()}>
              Import
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (kind === "scripture") {
    return (
      <Card className="p-4">
        <h3 className="mb-2 text-sm font-medium">Import scripture</h3>
        <Input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="e.g. John 3:16-18"
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Translation</Label>
            <select
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {TRANSLATIONS.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Verses per slide</Label>
            <Input
              type="number"
              min={1}
              max={5}
              value={versesPer}
              onChange={(e) => setVersesPer(Math.max(1, Number(e.target.value) || 1))}
              className="h-9"
            />
          </div>
        </div>
        {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
        <Button
          size="sm"
          className="mt-2 w-full"
          onClick={importScripture}
          disabled={!ref.trim() || busy}
        >
          {busy ? "Fetching…" : "Fetch & add"}
        </Button>
      </Card>
    );
  }

  // media / mixed
  return (
    <Card className="p-4">
      <h3 className="mb-2 text-sm font-medium">Import images</h3>
      <label className="flex h-32 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-border text-xs text-muted-foreground transition hover:border-primary">
        <Plus className="mb-1 h-5 w-5" />
        Click to upload
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => importImages(e.target.files)}
        />
      </label>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Stored locally as data URLs. Each image becomes its own slide.
      </p>
    </Card>
  );
}
