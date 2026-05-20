import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLibrary } from "@/lib/store";
import { parseLyrics, fileToCompressedImageDataUrl, scriptureToSlides } from "@/lib/parsers";
import { fetchScriptureBolls, TRANSLATIONS } from "@/lib/bible";
import { searchSongs, type SongResult } from "@/lib/songs";
import { SlideView } from "@/components/SlideView";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUpLeft, ArrowUpRight, Plus, Trash2, GripVertical, Search, Loader2, Pencil } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Slide, DeckKind } from "@/lib/types";

export const Route = createFileRoute("/deck/$deckId")({
  component: DeckEditor,
});

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function kindBadgeBg(kind: DeckKind): string {
  if (kind === "song") return "bg-[var(--brand-blue)] text-[var(--brand-white)]";
  if (kind === "scripture") return "bg-[var(--brand-green)] text-[var(--brand-white)]";
  if (kind === "media") return "bg-[var(--brand-orange)] text-[var(--brand-white)]";
  return "bg-muted text-foreground";
}

/* Reusable card frame matching the mockup: thin foreground border, large radius */
function PanelCard({
  label,
  className = "",
  children,
}: {
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-3xl border border-foreground bg-background p-5 ${className}`}>
      {label && (
        <h3 className="mono mb-4 text-xs uppercase tracking-wider">{label}</h3>
      )}
      {children}
    </section>
  );
}

function DeckEditor() {
  const { deckId } = Route.useParams();
  const navigate = useNavigate();
  const deck = useLibrary((s) => s.decks[deckId]);
  const { updateDeck, addSlide, updateSlide, removeSlide, reorderSlides } = useLibrary();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [multiSel, setMultiSel] = useState<Set<string>>(new Set());
  const [groupView, setGroupView] = useState(true);
  const [editingName, setEditingName] = useState(false);

  const selected = useMemo(
    () => deck?.slides.find((s) => s.id === selectedId) ?? deck?.slides[0] ?? null,
    [deck, selectedId]
  );

  useEffect(() => {
    if (!deck) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const idx = deck.slides.findIndex((s) => s.id === (selected?.id ?? ""));
        const next = deck.slides[Math.min(deck.slides.length - 1, idx + 1)];
        if (next) { setSelectedId(next.id); setMultiSel(new Set([next.id])); }
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = deck.slides.findIndex((s) => s.id === (selected?.id ?? ""));
        const prev = deck.slides[Math.max(0, idx - 1)];
        if (prev) { setSelectedId(prev.id); setMultiSel(new Set([prev.id])); }
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
          <Link to="/" className="mt-3 inline-block underline">Back to library</Link>
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
        next.has(id) ? next.delete(id) : next.add(id);
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
      {/* Header */}
      <header className="px-6 pt-6 md:px-10 md:pt-8">
        <div className="mx-auto grid max-w-7xl grid-cols-3 items-center gap-4">
          <div className="justify-self-start">
            <Link
              to="/"
              className="pill flex h-12 w-12 items-center justify-center bg-foreground text-background transition hover:opacity-90"
              title="Back"
              aria-label="Back"
            >
              <ArrowUpLeft className="h-5 w-5" />
            </Link>
          </div>

          <div className="flex items-center justify-center gap-3 justify-self-center">
            {editingName ? (
              <Input
                autoFocus
                value={deck.name}
                onChange={(e) => updateDeck(deck.id, { name: e.target.value })}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
                className="h-12 w-72 border-foreground text-3xl"
              />
            ) : (
              <h1
                onClick={() => setEditingName(true)}
                className="cursor-text truncate text-3xl text-muted-foreground md:text-4xl"
                title="Click to rename"
              >
                {deck.name}
              </h1>
            )}
            <button
              onClick={() => setEditingName((v) => !v)}
              className="rounded-full p-2 hover:bg-muted"
              title="Rename"
              aria-label="Rename"
            >
              <Pencil className="h-5 w-5" />
            </button>
            <span
              className={`pill mono ml-2 px-5 py-1.5 text-xs uppercase tracking-wider ${kindBadgeBg(deck.kind)}`}
            >
              {deck.kind}
            </span>
          </div>

          <div className="justify-self-end">
            <button
              onClick={() => navigate({ to: "/present", search: { deck: deck.id } })}
              className="pill flex items-center gap-2 border border-foreground bg-background px-6 py-2.5 text-base transition hover:bg-foreground hover:text-background"
            >
              Present <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8 md:px-10 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Importers deckId={deck.id} kind={deck.kind} />

          {deck.kind === "media" && <MediaOptions deckId={deck.id} />}

          <PanelCard>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="mono text-xs uppercase tracking-wider">
                Slides ({deck.slides.length})
                {multiSel.size > 0 && (
                  <span className="ml-2 text-foreground">· {multiSel.size} selected</span>
                )}
              </h2>
              <div className="flex items-center gap-2">
                {(deck.kind === "song" || deck.kind === "scripture") && (
                  <label className="mono flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={groupView}
                      onChange={(e) => setGroupView(e.target.checked)}
                    />
                    Group by section
                  </label>
                )}
                {multiSel.size > 0 && (
                  <button
                    onClick={deleteSelected}
                    className="pill flex items-center gap-1 bg-[var(--brand-red)] px-3 py-1.5 text-xs text-[var(--brand-white)]"
                  >
                    <Trash2 className="h-3 w-3" /> Delete selected
                  </button>
                )}
                <button
                  onClick={() =>
                    addSlide(deck.id, { id: uid(), kind: "blank", lines: [""] } as Slide)
                  }
                  className="pill flex items-center gap-1 border border-foreground px-3 py-1.5 text-xs transition hover:bg-foreground hover:text-background"
                >
                  <Plus className="h-3 w-3" /> Add blank
                </button>
              </div>
            </div>
            {deck.slides.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No slides yet, use the importer above to get started!
              </p>
            ) : (
              <div className="max-h-[calc(100vh-300px)] overflow-y-auto pr-1">
                {groupView && (deck.kind === "song" || deck.kind === "scripture") ? (
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
          </PanelCard>
        </div>

        <aside className="space-y-5">
          <div>
            <div className="mono mb-3 text-xs uppercase tracking-wider">Preview</div>
            <div className="overflow-hidden rounded-2xl bg-[var(--brand-black)]">
              <SlideView slide={selected} variant="preview" />
            </div>
          </div>

          {selected && (
            <PanelCard label="Edit slide">
              <div className="space-y-3">
                <Field label="Group">
                  <PillInput
                    value={selected.section ?? ""}
                    onChange={(v) => updateSlide(deck.id, selected.id, { section: v })}
                    placeholder="Chorus, Verse 1…"
                  />
                </Field>
                {deck.kind === "scripture" && (
                  <Field label="Reference">
                    <PillInput
                      value={selected.reference ?? ""}
                      onChange={(v) => updateSlide(deck.id, selected.id, { reference: v })}
                      placeholder="e.g. John 3:16"
                    />
                  </Field>
                )}
                <div>
                  <div className="mono mb-2 text-[10px] uppercase tracking-wider">Text</div>
                  <Textarea
                    rows={6}
                    value={selected.lines?.join("\n") ?? ""}
                    onChange={(e) =>
                      updateSlide(deck.id, selected.id, { lines: e.target.value.split("\n") })
                    }
                    className="rounded-2xl border-foreground"
                  />
                </div>
              </div>
            </PanelCard>
          )}
        </aside>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="mono w-24 text-[10px] uppercase tracking-wider">{label}</div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function PillInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="pill w-full border border-foreground bg-background px-4 py-1.5 text-sm outline-none focus:ring-1 focus:ring-foreground"
    />
  );
}

function MediaOptions({ deckId }: { deckId: string }) {
  const deck = useLibrary((s) => s.decks[deckId]);
  const updateDeck = useLibrary((s) => s.updateDeck);
  if (!deck) return null;
  const auto = deck.autoAdvanceMs ?? 0;
  const dissolve = deck.dissolveMs ?? 0;
  return (
    <PanelCard label="Playback">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <span className="mono text-[10px] uppercase tracking-wider">Auto-advance</span>
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
            className="pill h-8 w-20 border border-foreground bg-background px-3 text-sm outline-none"
          />
          <span className="text-xs text-muted-foreground">s</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!deck.loop}
            onChange={(e) => updateDeck(deckId, { loop: e.target.checked })}
          />
          <span className="mono text-[10px] uppercase tracking-wider">Loop</span>
        </label>
        <label className="flex items-center gap-2">
          <span className="mono text-[10px] uppercase tracking-wider">Cross-dissolve</span>
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
            className="pill h-8 w-20 border border-foreground bg-background px-3 text-sm outline-none"
          />
          <span className="text-xs text-muted-foreground">s</span>
        </label>
      </div>
    </PanelCard>
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
            className={`group relative cursor-pointer overflow-hidden rounded-2xl border-2 transition ${
              isSelected
                ? "border-foreground"
                : inMulti
                ? "border-foreground/60"
                : "border-transparent hover:border-muted-foreground"
            }`}
          >
            <SlideView slide={s} variant="thumb" />
            <div className="mono absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">
              <GripVertical className="h-3 w-3" /> {i + 1}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(s.id);
              }}
              className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
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

function GroupedSongGrid(props: {
  slides: Slide[];
  selectedId: string | null;
  multiSel: Set<string>;
  onSelect: (id: string, e?: React.MouseEvent) => void;
  onRemove: (id: string) => void;
  onReorder: (ids: string[]) => void;
  dense?: boolean;
}) {
  const SECTION_RE = /^\s*\[?(verse\s*\d*|chorus|bridge|pre[- ]?chorus|intro|outro|tag|interlude|refrain)\]?:?\s*$/i;
  const sectionOf = (s: Slide): string | null => {
    if (s.section && s.section.trim()) return s.section.trim();
    if (s.kind === "lyric" && s.reference && SECTION_RE.test(s.reference)) {
      return s.reference.trim();
    }
    return null;
  };

  const groups: { label: string; slides: Slide[] }[] = [];
  let currentLabel = "Section";
  for (const s of props.slides) {
    const sec = sectionOf(s);
    if (sec) currentLabel = sec;
    const last = groups[groups.length - 1];
    if (!last || last.label !== currentLabel) groups.push({ label: currentLabel, slides: [s] });
    else last.slides.push(s);
  }

  return (
    <div className="space-y-5">
      {groups.map((g, gi) => (
        <section key={`${g.label}-${gi}`}>
          <h3 className="mono mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
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
  const [lyrics, setLyrics] = useState("");

  const [songQuery, setSongQuery] = useState("");
  const [songResults, setSongResults] = useState<SongResult[]>([]);
  const [songSearching, setSongSearching] = useState(false);
  const [songErr, setSongErr] = useState<string | null>(null);

  const [ref, setRef] = useState("");
  const [translation, setTranslation] = useState("NIV");
  const [versesPer, setVersesPer] = useState(1);
  const [keepLineBreaks, setKeepLineBreaks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [manualRef, setManualRef] = useState("");
  const [manualText, setManualText] = useState("");

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
      const labelled = `${reference} ${translation}`;
      // Annotate each slide's reference so the translation shows on the slide.
      const slides = scriptureToSlides(reference, verses, versesPer, { keepLineBreaks })
        .map((s) => ({ ...s, reference: s.reference ? `${s.reference} ${translation}` : labelled }));
      slides.forEach((s) => addSlide(deckId, s));
      updateDeck(deckId, { name: labelled });
      setRef("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const importImages = async (files: FileList | null) => {
    if (!files) return;
    const ACCEPTED = /^image\/(png|jpe?g|webp|gif|bmp)$/i;
    const list = Array.from(files).filter((f) => ACCEPTED.test(f.type));
    if (list.length === 0) return;
    const urls = await Promise.all(
      list.map((f) => fileToCompressedImageDataUrl(f).catch(() => null))
    );
    urls.forEach((url) => {
      if (url) addSlide(deckId, { kind: "image", imageUrl: url, lines: [] });
    });
  };

  if (kind === "song") {
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <PanelCard label="Search for a song">
          <form onSubmit={runSongSearch} className="flex gap-2">
            <div className="pill flex flex-1 items-center gap-2 border border-foreground bg-background px-4 py-2">
              <input
                value={songQuery}
                onChange={(e) => setSongQuery(e.target.value)}
                placeholder="e.g. How Great is Our God"
                className="w-full bg-transparent text-sm outline-none placeholder:italic placeholder:text-muted-foreground"
              />
            </div>
            <button
              type="submit"
              disabled={songSearching || !songQuery.trim()}
              className="pill flex h-10 w-10 items-center justify-center bg-foreground text-background transition hover:opacity-90 disabled:opacity-50"
              aria-label="Search"
            >
              {songSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </button>
          </form>
          {songErr && <p className="mt-2 text-xs text-destructive">{songErr}</p>}
          <div className="mt-3 max-h-72 space-y-1 overflow-auto">
            {songResults.map((s, idx) => (
              <button
                key={`${s.title}-${s.artist}-${idx}`}
                onClick={() => importSong(s)}
                className="group flex w-full items-center gap-2 rounded-xl p-2 text-left text-sm transition hover:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{s.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {s.artist}{s.album ? ` · ${s.album}` : ""}
                  </div>
                </div>
                <Plus className="h-5 w-5" />
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="mono text-[10px] uppercase tracking-wider">Lines per slide</span>
            <input
              type="number"
              min={1}
              max={8}
              value={linesPer}
              onChange={(e) => setLinesPer(Math.max(1, Number(e.target.value) || 1))}
              className="pill h-7 w-16 border border-foreground bg-background px-3 text-xs outline-none"
            />
          </div>
        </PanelCard>

        <PanelCard label="Or paste lyrics">
          <div className="overflow-hidden rounded-2xl border border-foreground">
            <Textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              rows={8}
              placeholder={`[Verse 1]\nAmazing grace, how sweet the sound\nThat saved a wretch like me\n\n[Chorus]\n...`}
              className="mono block w-full resize-none border-0 bg-transparent px-4 py-3 text-xs shadow-none focus-visible:ring-0"
            />
          </div>
          <button
            onClick={importLyrics}
            disabled={!lyrics.trim()}
            className="pill mt-3 w-full bg-foreground py-2.5 text-sm text-background transition hover:opacity-90 disabled:opacity-50"
          >
            Import
          </button>
        </PanelCard>
      </div>
    );
  }

  if (kind === "scripture") {
    const importManualScripture = () => {
      const refRaw = manualRef.trim();
      const lines = manualText.split("\n").map((l) => l.trim()).filter(Boolean);
      if (!refRaw || lines.length === 0) return;
      // Append translation abbreviation, e.g. "John 3:1-2 NIV".
      const reference = refRaw.match(/\b(NIV|NLT|ESV|NRSVCE|NASB|NKJV|KJV)\b\s*$/i)
        ? refRaw
        : `${refRaw} ${translation}`;
      const verses = lines.map((text, i) => ({ verse: i + 1, text }));
      const slides = scriptureToSlides(reference, verses, versesPer, { keepLineBreaks });
      slides.forEach((s) => addSlide(deckId, s));
      updateDeck(deckId, { name: reference });
      setManualRef("");
      setManualText("");
    };
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <PanelCard label="Import scripture">
          <PillInput value={ref} onChange={setRef} placeholder="e.g. John 3, John 3:16-18, John 3:21-John 4:2" />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="mono mb-1 text-[10px] uppercase tracking-wider">Translation</div>
              <select
                value={translation}
                onChange={(e) => setTranslation(e.target.value)}
                className="pill h-9 w-full border border-foreground bg-background px-3 text-sm outline-none"
              >
                {TRANSLATIONS.map((t) => (
                  <option key={t.code} value={t.code}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="mono mb-1 text-[10px] uppercase tracking-wider">Verses per slide</div>
              <input
                type="number"
                min={1}
                max={2}
                value={versesPer}
                onChange={(e) =>
                  setVersesPer(Math.min(2, Math.max(1, Number(e.target.value) || 1)))
                }
                className="pill h-9 w-full border border-foreground bg-background px-3 text-sm outline-none"
              />
            </div>
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2">
            <span className="mono text-[10px] uppercase tracking-wider">Keep line breaks</span>
            <input
              type="checkbox"
              checked={keepLineBreaks}
              onChange={(e) => setKeepLineBreaks(e.target.checked)}
            />
          </label>
          {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
          <button
            onClick={importScripture}
            disabled={!ref.trim() || busy}
            className="pill mt-3 w-full bg-foreground py-2.5 text-sm text-background transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Fetching…" : "Import"}
          </button>
        </PanelCard>

        <PanelCard label="Or enter manually">
          <div className="mono mb-1 text-[10px] uppercase tracking-wider">Reference</div>
          <PillInput value={manualRef} onChange={setManualRef} placeholder="e.g. John 3:16-17" />
          <div className="mono mb-1 mt-3 text-[10px] uppercase tracking-wider">Verses</div>
          <div className="rounded-2xl border border-foreground p-3">
            <Textarea
              rows={5}
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder={`For God so loved the world…`}
              className="mono border-0 bg-transparent p-0 text-xs italic shadow-none focus-visible:ring-0"
            />
          </div>
          <button
            onClick={importManualScripture}
            disabled={!manualRef.trim() || !manualText.trim()}
            className="pill mt-3 w-full bg-foreground py-2.5 text-sm text-background transition hover:opacity-90 disabled:opacity-50"
          >
            Import
          </button>
        </PanelCard>
      </div>
    );
  }

  return <MediaImporter onImport={importImages} />;
}

function MediaImporter({ onImport }: { onImport: (files: FileList | null) => void }) {
  const [over, setOver] = useState(false);
  return (
    <PanelCard label="Import images">
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
        className={`mono flex h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-xs uppercase tracking-wider transition ${
          over ? "border-foreground bg-foreground/5" : "border-foreground/60 text-muted-foreground hover:border-foreground"
        }`}
      >
        {over ? "Drop to upload" : "Drop images here or click to browse"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          multiple
          className="hidden"
          onChange={(e) => onImport(e.target.files)}
        />
      </label>
    </PanelCard>
  );
}
