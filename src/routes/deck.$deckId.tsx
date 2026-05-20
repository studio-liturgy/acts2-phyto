import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLibrary } from "@/lib/store";
import { parseLyrics, fileToDataUrl, scriptureToSlides } from "@/lib/parsers";
import { fetchScriptureBolls, TRANSLATIONS } from "@/lib/bible";
import { searchSongs, type SongResult } from "@/lib/songs";
import { SlideView } from "@/components/SlideView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Plus, Trash2, GripVertical, Search, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const [multiSel, setMultiSel] = useState<Set<string>>(new Set());

  const selected = useMemo(
    () => deck?.slides.find((s) => s.id === selectedId) ?? deck?.slides[0] ?? null,
    [deck, selectedId]
  );

  // Keyboard: arrows move single selection; Delete removes selection(s).
  useEffect(() => {
    if (!deck) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const idx = deck.slides.findIndex((s) => s.id === (selected?.id ?? ""));
        const next = deck.slides[Math.min(deck.slides.length - 1, idx + 1)];
        if (next) {
          setSelectedId(next.id);
          setMultiSel(new Set([next.id]));
        }
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = deck.slides.findIndex((s) => s.id === (selected?.id ?? ""));
        const prev = deck.slides[Math.max(0, idx - 1)];
        if (prev) {
          setSelectedId(prev.id);
          setMultiSel(new Set([prev.id]));
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (multiSel.size > 0) {
          e.preventDefault();
          multiSel.forEach((id) => removeSlide(deck.id, id));
          setMultiSel(new Set());
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [deck, selected, multiSel, removeSlide]);

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

  const dense = deck.slides.length > 20;

  const handleSelect = (id: string, e?: React.MouseEvent) => {
    setSelectedId(id);
    if (e && (e.metaKey || e.ctrlKey)) {
      setMultiSel((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } else if (e && e.shiftKey && selected) {
      const ids = deck.slides.map((s) => s.id);
      const a = ids.indexOf(selected.id);
      const b = ids.indexOf(id);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setMultiSel(new Set(ids.slice(lo, hi + 1)));
    } else {
      setMultiSel(new Set([id]));
    }
  };

  const deleteSelected = () => {
    multiSel.forEach((id) => removeSlide(deck.id, id));
    setMultiSel(new Set());
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <Button asChild size="sm" variant="ghost">
              <Link to="/">
                <ArrowLeft className="mr-1 h-4 w-4" /> Create
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
        <div className="space-y-6">
          <Importers deckId={deck.id} kind={deck.kind} />

          {deck.kind === "media" && <MediaOptions deckId={deck.id} />}

          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Slides ({deck.slides.length})
                {multiSel.size > 0 && (
                  <span className="ml-2 normal-case text-foreground">· {multiSel.size} selected</span>
                )}
              </h2>
              <div className="flex gap-2">
                {multiSel.size > 0 && (
                  <Button size="sm" variant="destructive" onClick={deleteSelected}>
                    <Trash2 className="mr-1 h-3 w-3" /> Delete selected
                  </Button>
                )}
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
            </div>
            {deck.slides.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No slides yet. Use an importer above.
              </p>
            ) : (
              <div className="max-h-[calc(100vh-260px)] overflow-y-auto pr-1">
                {deck.kind === "song" ? (
                  <GroupedSongGrid
                    slides={deck.slides}
                    selectedId={selected?.id ?? null}
                    multiSel={multiSel}
                    onSelect={handleSelect}
                    onRemove={(id) => removeSlide(deck.id, id)}
                    onReorder={(ids) => reorderSlides(deck.id, ids)}
                    dense={dense}
                  />
                ) : (
                  <SlideGrid
                    slides={deck.slides}
                    selectedId={selected?.id ?? null}
                    multiSel={multiSel}
                    onSelect={handleSelect}
                    onRemove={(id) => removeSlide(deck.id, id)}
                    onReorder={(ids) => reorderSlides(deck.id, ids)}
                    dense={dense}
                  />
                )}
              </div>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Click to select · Shift / ⌘ click for multi-select · ← → navigate · Delete removes selected
            </p>
          </Card>
        </div>

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

function MediaOptions({ deckId }: { deckId: string }) {
  const deck = useLibrary((s) => s.decks[deckId]);
  const updateDeck = useLibrary((s) => s.updateDeck);
  if (!deck) return null;
  const auto = deck.autoAdvanceMs ?? 0;
  const dissolve = deck.dissolveMs ?? 0;
  return (
    <Card className="flex flex-wrap items-center gap-4 p-3 text-sm">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Playback
      </span>
      <label className="flex items-center gap-2">
        <span className="text-xs">Auto-advance</span>
        <Input
          type="number"
          min={0}
          step={0.5}
          value={auto ? (auto / 1000).toString() : ""}
          placeholder="off"
          onChange={(e) => {
            const n = Number(e.target.value);
            updateDeck(deckId, { autoAdvanceMs: n > 0 ? Math.round(n * 1000) : 0 });
          }}
          className="h-8 w-20"
        />
        <span className="text-xs text-muted-foreground">seconds</span>
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={!!deck.loop}
          onChange={(e) => updateDeck(deckId, { loop: e.target.checked })}
        />
        Loop
      </label>
      <label className="flex items-center gap-2">
        <span className="text-xs">Cross-dissolve</span>
        <Input
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
          className="h-8 w-20"
        />
        <span className="text-xs text-muted-foreground">seconds (0–2)</span>
      </label>
    </Card>
  );
}



function SlideGrid({
  slides,
  selectedId,
  multiSel,
  onSelect,
  onRemove,
  onReorder,
  dense,
}: {
  slides: Slide[];
  selectedId: string | null;
  multiSel: Set<string>;
  onSelect: (id: string, e?: React.MouseEvent) => void;
  onRemove: (id: string) => void;
  onReorder: (ids: string[]) => void;
  dense?: boolean;
}) {
  const dragId = useRef<string | null>(null);
  const cols = dense
    ? "grid-cols-3 md:grid-cols-5 lg:grid-cols-6"
    : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
  return (
    <div className={`grid gap-3 ${cols}`}>
      {slides.map((s, i) => {
        const isSelected = selectedId === s.id;
        const inMulti = multiSel.has(s.id);
        return (
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
            onClick={(e) => onSelect(s.id, e)}
            className={`group relative cursor-pointer rounded-md border-2 transition ${
              isSelected
                ? "border-primary"
                : inMulti
                ? "border-primary/60"
                : "border-transparent hover:border-border"
            }`}
          >
            <SlideView slide={s} variant="thumb" className="rounded" />
            <div className="absolute left-1 top-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
              <GripVertical className="h-3 w-3" /> {i + 1}
            </div>
            {inMulti && (
              <div className="absolute right-1 bottom-1 h-3 w-3 rounded-full bg-primary ring-2 ring-white" />
            )}
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
        );
      })}
    </div>
  );
}

/** Group song slides by section reference (Verse, Chorus, Bridge…). */
function GroupedSongGrid(props: {
  slides: Slide[];
  selectedId: string | null;
  multiSel: Set<string>;
  onSelect: (id: string, e?: React.MouseEvent) => void;
  onRemove: (id: string) => void;
  onReorder: (ids: string[]) => void;
  dense?: boolean;
}) {
  const groups: { label: string; slides: Slide[] }[] = [];
  let currentLabel = "Section";
  for (const s of props.slides) {
    if (s.reference && s.reference.trim()) currentLabel = s.reference.trim();
    const last = groups[groups.length - 1];
    if (!last || last.label !== currentLabel) {
      groups.push({ label: currentLabel, slides: [s] });
    } else {
      last.slides.push(s);
    }
  }

  return (
    <div className="space-y-5">
      {groups.map((g, gi) => (
        <section key={`${g.label}-${gi}`}>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {g.label}
          </h3>
          <SlideGrid
            slides={g.slides}
            selectedId={props.selectedId}
            multiSel={props.multiSel}
            onSelect={props.onSelect}
            onRemove={props.onRemove}
            onReorder={props.onReorder}
            dense={props.dense}
          />
        </section>
      ))}
    </div>
  );
}


function Importers({ deckId, kind }: { deckId: string; kind: DeckKind }) {
  const { addSlide, updateDeck } = useLibrary();

  const [linesPer, setLinesPer] = useState(2);

  // Paste lyrics
  const [lyrics, setLyrics] = useState("");

  // Song search
  const [songQuery, setSongQuery] = useState("");
  const [songResults, setSongResults] = useState<SongResult[]>([]);
  const [songSearching, setSongSearching] = useState(false);
  const [songErr, setSongErr] = useState<string | null>(null);

  // Scripture
  const [ref, setRef] = useState("");
  const [translation, setTranslation] = useState("NIV");
  const [versesPer, setVersesPer] = useState(1);
  const [keepLineBreaks, setKeepLineBreaks] = useState(false);
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
    } catch (e) {
      setSongErr((e as Error).message);
    } finally {
      setSongSearching(false);
    }
  };

  const importSong = (s: SongResult) => {
    const slides = parseLyrics(s.lyrics, linesPer);
    slides.forEach((sl) => addSlide(deckId, sl));
    updateDeck(deckId, { name: `${s.title} — ${s.artist}` });
  };

  const importScripture = async () => {
    if (!ref.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const { reference, verses } = await fetchScriptureBolls(ref, translation, {
        removeLineBreaks: !keepLineBreaks,
      });
      const slides = scriptureToSlides(reference, verses, versesPer);
      slides.forEach((s) => addSlide(deckId, s));
      updateDeck(deckId, { name: reference });
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
      <div className="space-y-3">
        <Card className="flex items-center gap-3 p-3">
          <Label className="text-xs">Lines per slide</Label>
          <Input
            type="number"
            min={1}
            max={8}
            value={linesPer}
            onChange={(e) => setLinesPer(Math.max(1, Number(e.target.value) || 1))}
            className="h-8 w-20"
          />
          <span className="text-xs text-muted-foreground">
            Applies to both song search and pasted lyrics.
          </span>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-medium">Search worship songs</h3>
            <form onSubmit={runSongSearch} className="flex gap-2">
              <Input
                value={songQuery}
                onChange={(e) => setSongQuery(e.target.value)}
                placeholder="e.g. Oceans Hillsong"
              />
              <Button size="sm" type="submit" disabled={songSearching || !songQuery.trim()}>
                {songSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </form>
            {songErr && <p className="mt-2 text-xs text-destructive">{songErr}</p>}
            <div className="mt-3 max-h-72 space-y-1 overflow-auto">
              {songResults.map((s, idx) => {
                const preview = s.lyrics
                  .split("\n")
                  .map((l) => l.trim())
                  .filter(Boolean)
                  .slice(0, 8)
                  .join("\n");
                return (
                  <button
                    key={`${s.title}-${s.artist}-${idx}`}
                    onClick={() => importSong(s)}
                    title={preview || "No preview available"}
                    className="group/song relative flex w-full items-center gap-2 rounded p-2 text-left text-sm transition hover:bg-muted"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{s.title}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {s.artist}
                        {s.album ? ` · ${s.album}` : ""}
                      </div>
                    </div>
                    <Plus className="h-4 w-4 text-muted-foreground" />
                    {preview && (
                      <div className="pointer-events-none absolute left-full top-0 z-20 ml-2 hidden w-72 whitespace-pre-line rounded-md border border-border bg-popover p-3 text-xs leading-relaxed text-popover-foreground shadow-lg group-hover/song:block">
                        {preview}
                        {s.lyrics.split("\n").filter((l) => l.trim()).length > 8 && (
                          <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                            …more
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Lyrics via lrclib.net — strong coverage of modern worship.
            </p>
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-medium">Or paste lyrics</h3>
            <Textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              rows={8}
              placeholder={`[Verse 1]\nAmazing grace, how sweet the sound\nThat saved a wretch like me\n\n[Chorus]\n...`}
              className="font-mono text-xs"
            />
            <div className="mt-2 flex">
              <Button size="sm" className="ml-auto" onClick={importLyrics} disabled={!lyrics.trim()}>
                Import
              </Button>
            </div>
          </Card>
        </div>
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
          placeholder="e.g. John 3, John 3:16-18, John 3:21-John 4:2"
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
            <Label className="text-xs">Verses per slide (max 2)</Label>
            <Input
              type="number"
              min={1}
              max={2}
              value={versesPer}
              onChange={(e) =>
                setVersesPer(Math.min(2, Math.max(1, Number(e.target.value) || 1)))
              }
              className="h-9"
            />
          </div>
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={keepLineBreaks}
            onChange={(e) => setKeepLineBreaks(e.target.checked)}
          />
          Keep original line breaks (off by default — flowed into a paragraph).
        </label>
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

  return <MediaImporter onImport={importImages} />;
}

function MediaImporter({ onImport }: { onImport: (files: FileList | null) => void }) {
  const [over, setOver] = useState(false);
  return (
    <Card className="p-4">
      <h3 className="mb-2 text-sm font-medium">Import images</h3>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer.files?.length) onImport(e.dataTransfer.files);
        }}
        className={`flex h-32 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed text-xs transition ${
          over
            ? "border-primary bg-primary/5 text-primary"
            : "border-border text-muted-foreground hover:border-primary"
        }`}
      >
        <Plus className="mb-1 h-5 w-5" />
        {over ? "Drop to upload" : "Drop images here or click to browse"}
        <span className="mt-1 text-[10px] opacity-70">Multiple files supported</span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => onImport(e.target.files)}
        />
      </label>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Stored locally as data URLs. Each image becomes its own slide.
      </p>
    </Card>
  );
}

