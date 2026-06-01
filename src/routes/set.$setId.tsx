import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLibrary, useSongTemplateDraft } from "@/lib/store";
import { SongTemplateEditor } from "@/components/SongTemplateEditor";
import { parseLyrics, fileToCompressedImageDataUrl, scriptureToSlides } from "@/lib/parsers";
import { fetchScriptureBolls, TRANSLATIONS } from "@/lib/bible";
import { searchSongs, type SongResult } from "@/lib/songs";
import { SlideView } from "@/components/SlideView";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUpLeft, ArrowUpRight, Plus, Trash2, GripVertical, Search, Loader2, Pencil } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Slide, SetKind } from "@/lib/types";
import { z } from "zod";

const searchSchema = z.object({
  redirectTo: z
    .string()
    .optional()
    .transform((s) =>
      typeof s === "string" && s.startsWith("/") && !s.startsWith("//") ? s : undefined,
    ),
});

export const Route = createFileRoute("/set/$setId")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Set Editor | phyto" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SetEditor,
});

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function kindBadgeBg(kind: SetKind): string {
  if (kind === "song") return "bg-[var(--brand-blue)] text-[var(--brand-white)]";
  if (kind === "scripture") return "bg-[var(--brand-green)] text-[var(--brand-white)]";
  if (kind === "media") return "bg-[var(--brand-orange)] text-[var(--brand-white)]";
  return "bg-muted text-foreground";
}

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

function SetHeader({
  phytoSet,
  redirectTo,
  editingName,
  setEditingName,
  updateSet,
  navigate,
  deleteSet,
}: {
  phytoSet: { id: string; name: string; kind: SetKind };
  redirectTo?: string;
  editingName: boolean;
  setEditingName: (v: boolean | ((prev: boolean) => boolean)) => void;
  updateSet: (id: string, patch: object) => void;
  navigate: ReturnType<typeof useNavigate>;
  deleteSet: (id: string) => void;
}) {
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-foreground px-6 py-4 md:px-10">
      {/* Back */}
      <Link
        to={redirectTo ?? "/"}
        className="pill flex h-10 w-10 shrink-0 items-center justify-center bg-foreground text-background transition hover:opacity-90"
        title="Back"
        aria-label="Back"
      >
        <ArrowUpLeft className="h-5 w-5" />
      </Link>

      {/* Title + badge */}
      <div className="flex min-w-0 items-center gap-2">
        {editingName ? (
          <Input
            autoFocus
            value={phytoSet.name}
            onChange={(e) => updateSet(phytoSet.id, { name: e.target.value })}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
            className="h-9 w-56 border-foreground text-base"
          />
        ) : (
          <h1
            onClick={() => setEditingName(true)}
            className="cursor-text truncate text-base text-muted-foreground"
            title="Click to rename"
          >
            {phytoSet.name}
          </h1>
        )}
        <button
          onClick={() => setEditingName((v) => !v)}
          className="shrink-0 rounded-full p-1.5 hover:bg-muted"
          title="Rename"
          aria-label="Rename"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <span
          className={`pill mono shrink-0 px-2.5 py-0.5 text-[10px] uppercase tracking-wider ${kindBadgeBg(phytoSet.kind)}`}
        >
          {phytoSet.kind}
        </span>
      </div>

      <div className="flex-1" />

      {/* Right actions */}
      <button
        onClick={() => {
          if (confirm("Delete this set?")) {
            deleteSet(phytoSet.id);
            navigate({ to: "/" });
          }
        }}
        className="pill shrink-0 bg-[var(--brand-red)] px-4 py-2 text-sm text-[var(--brand-white)] transition hover:opacity-90"
      >
        Delete
      </button>
      <AddToGathering setId={phytoSet.id} />
      <button
        onClick={() => navigate({ to: "/present", search: { set: phytoSet.id } })}
        className="pill flex shrink-0 items-center gap-2 border border-foreground bg-background px-5 py-2 text-sm transition hover:bg-foreground hover:text-background"
      >
        Present <ArrowUpRight className="h-4 w-4" />
      </button>
    </header>
  );
}

function SetEditor() {
  const { setId } = Route.useParams();
  const { redirectTo } = Route.useSearch();
  const navigate = useNavigate();
  const phytoSet = useLibrary((s) => s.sets[setId]);
  const { updateSet, addSlide, updateSlide, removeSlide, reorderSlides, deleteSet } = useLibrary();
  const songTemplate = useLibrary((s) => s.songTemplate);
  const songDraft = useSongTemplateDraft((s) => s.draft);
  const effectiveTemplate = songDraft ?? songTemplate;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [multiSel, setMultiSel] = useState<Set<string>>(new Set());
  const [groupView, setGroupView] = useState(true);
  const [editingName, setEditingName] = useState(false);

  const selected = useMemo(
    () => phytoSet?.slides.find((s) => s.id === selectedId) ?? phytoSet?.slides[0] ?? null,
    [phytoSet, selectedId]
  );

  useEffect(() => {
    if (!phytoSet) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const idx = phytoSet.slides.findIndex((s) => s.id === (selected?.id ?? ""));
        const next = phytoSet.slides[Math.min(phytoSet.slides.length - 1, idx + 1)];
        if (next) { setSelectedId(next.id); setMultiSel(new Set([next.id])); }
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = phytoSet.slides.findIndex((s) => s.id === (selected?.id ?? ""));
        const prev = phytoSet.slides[Math.max(0, idx - 1)];
        if (prev) { setSelectedId(prev.id); setMultiSel(new Set([prev.id])); }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (multiSel.size > 0) {
          e.preventDefault();
          multiSel.forEach((id) => removeSlide(phytoSet.id, id));
          setMultiSel(new Set());
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phytoSet, selected, multiSel, removeSlide]);

  if (!phytoSet) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">Set not found.</p>
          <Link to="/" className="mt-3 inline-block underline">Back to library</Link>
        </div>
      </div>
    );
  }

  const headerProps = {
    phytoSet,
    redirectTo,
    editingName,
    setEditingName,
    updateSet,
    navigate,
    deleteSet,
  };

  // Song: full-page two-column layout
  if (phytoSet.kind === "song") {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <SetHeader {...headerProps} />
        <div className="flex min-h-0 flex-1 divide-x divide-foreground">
          {/* Left: song editor */}
          <div className="flex w-1/2 min-h-0 flex-col overflow-hidden">
            <Importers setId={phytoSet.id} kind={phytoSet.kind} />
          </div>
          {/* Right: template editor + live slide grid */}
          <div className="w-1/2 overflow-y-auto p-6">
            <div className="mb-4">
              <SongTemplateEditor />
            </div>
            {phytoSet.slides.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Slides will appear here as you type
              </p>
            ) : (() => {
              const TINTS = ["var(--brand-blue)", "var(--brand-green)", "var(--brand-orange)"];
              const groups: { label: string | undefined; slides: Slide[] }[] = [];
              for (const s of phytoSet.slides) {
                const last = groups[groups.length - 1];
                if (!last || s.section !== last.label) {
                  groups.push({ label: s.section, slides: [s] });
                } else {
                  last.slides.push(s);
                }
              }
              return (
                <div className="space-y-4">
                  {groups.map((g, gi) => (
                    <div key={gi}>
                      {g.label && (
                        <div className="mono mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                          {g.label}
                        </div>
                      )}
                      <div
                        className="rounded-xl p-2"
                        style={{ backgroundColor: `color-mix(in oklab, ${TINTS[gi % 3]} 20%, transparent)` }}
                      >
                        <div className="grid grid-cols-2 gap-2">
                          {g.slides.map((s) => (
                            <div key={s.id} className="overflow-hidden rounded-md">
                              <SlideView slide={s} variant="thumb" template={effectiveTemplate} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    );
  }

  // Scripture: full-page two-column layout (mirrors song layout)
  if (phytoSet.kind === "scripture") {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <SetHeader {...headerProps} />
        <div className="flex min-h-0 flex-1 divide-x divide-foreground">
          {/* Left: import controls */}
          <div className="flex w-1/2 min-h-0 flex-col overflow-hidden">
            <Importers setId={phytoSet.id} kind={phytoSet.kind} />
          </div>
          {/* Right: live slide grid */}
          <div className="w-1/2 overflow-y-auto p-6">
            {phytoSet.slides.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Slides will appear here after you import
              </p>
            ) : (() => {
              const TINTS = ["var(--brand-blue)", "var(--brand-green)", "var(--brand-orange)"];
              const groups: { label: string | undefined; slides: Slide[] }[] = [];
              for (const s of phytoSet.slides) {
                const last = groups[groups.length - 1];
                if (!last || s.section !== last.label) {
                  groups.push({ label: s.section, slides: [s] });
                } else {
                  last.slides.push(s);
                }
              }
              return (
                <div className="space-y-4">
                  {groups.map((g, gi) => (
                    <div key={gi}>
                      {g.label && (
                        <div className="mono mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                          {g.label}
                        </div>
                      )}
                      <div
                        className="rounded-xl p-2"
                        style={{ backgroundColor: `color-mix(in oklab, ${TINTS[gi % 3]} 20%, transparent)` }}
                      >
                        <div className="grid grid-cols-2 gap-2">
                          {g.slides.map((s) => (
                            <div key={s.id} className="overflow-hidden rounded-md">
                              <SlideView slide={s} variant="thumb" template={phytoSet.template} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    );
  }

  // Media: original layout
  const dense = phytoSet.slides.length > 20;

  const handleSelect = (id: string, e?: React.MouseEvent) => {
    setSelectedId(id);
    if (e && (e.metaKey || e.ctrlKey)) {
      setMultiSel((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    } else if (e && e.shiftKey && selected) {
      const ids = phytoSet.slides.map((s) => s.id);
      const a = ids.indexOf(selected.id);
      const b = ids.indexOf(id);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setMultiSel(new Set(ids.slice(lo, hi + 1)));
    } else {
      setMultiSel(new Set([id]));
    }
  };

  const deleteSelected = () => {
    multiSel.forEach((id) => removeSlide(phytoSet.id, id));
    setMultiSel(new Set());
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SetHeader {...headerProps} />

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8 md:px-10 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Importers setId={phytoSet.id} kind={phytoSet.kind} />

          <PanelCard>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <h2 className="mono text-xs uppercase tracking-wider">
                  Slides ({phytoSet.slides.length})
                  {multiSel.size > 0 && (
                    <span className="ml-2 text-foreground">· {multiSel.size} selected</span>
                  )}
                </h2>
              </div>
              <div className="flex items-center gap-2">
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
                    addSlide(phytoSet.id, { id: uid(), kind: "blank", lines: [""] } as Slide)
                  }
                  className="pill flex items-center gap-1 border border-foreground px-3 py-1.5 text-xs transition hover:bg-foreground hover:text-background"
                >
                  <Plus className="h-3 w-3" /> Add blank
                </button>
              </div>
            </div>
            {phytoSet.slides.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No slides yet, use the importer above to get started!
              </p>
            ) : (
              <div className="max-h-[calc(100vh-300px)] overflow-y-auto pr-1">
                <SlideGrid
                  slides={phytoSet.slides}
                  selectedId={selected?.id ?? null}
                  multiSel={multiSel}
                  onSelect={handleSelect}
                  onRemove={(id) => removeSlide(phytoSet.id, id)}
                  onReorder={(ids) => reorderSlides(phytoSet.id, ids)}
                  dense={dense}
                  kind={phytoSet.kind}
                />
              </div>
            )}
          </PanelCard>
        </div>

        <aside className="space-y-5">
          <div>
            <div className="mono mb-3 text-xs uppercase tracking-wider">Preview</div>
            <div className="overflow-hidden rounded-lg bg-[var(--brand-black)]">
              <SlideView slide={selected} variant="preview" />
            </div>
          </div>

          {selected && (
            <PanelCard label="Edit slide">
              <div className="space-y-3">
                <Field label="Group">
                  <PillInput
                    value={selected.section ?? ""}
                    onChange={(v) => updateSlide(phytoSet.id, selected.id, { section: v })}
                    placeholder="Chorus, Verse 1…"
                  />
                </Field>
                <div>
                  <div className="mono mb-2 text-[10px] uppercase tracking-wider">Text</div>
                  <Textarea
                    rows={6}
                    value={selected.lines?.join("\n") ?? ""}
                    onChange={(e) =>
                      updateSlide(phytoSet.id, selected.id, { lines: e.target.value.split("\n") })
                    }
                    className="rounded-lg border-foreground"
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

function kindColor(kind?: SetKind): string {
  if (kind === "song") return "var(--brand-blue)";
  if (kind === "scripture") return "var(--brand-green)";
  if (kind === "media") return "var(--brand-orange)";
  return "var(--foreground)";
}

function SlideGrid({
  slides,
  selectedId,
  multiSel,
  onSelect,
  onRemove,
  onReorder,
  dense,
  kind,
}: {
  slides: Slide[];
  selectedId: string | null;
  multiSel: Set<string>;
  onSelect: (id: string, e?: React.MouseEvent) => void;
  onRemove: (id: string) => void;
  onReorder: (ids: string[]) => void;
  dense?: boolean;
  kind?: SetKind;
}) {
  const dragId = useRef<string | null>(null);
  const cols = dense
    ? "grid-cols-3 md:grid-cols-4"
    : "grid-cols-2 md:grid-cols-4";
  const selColor = kindColor(kind);
  return (
    <div className={`grid gap-3 ${cols}`}>
      {slides.map((s, i) => {
        const isSelected = selectedId === s.id;
        const inMulti = multiSel.has(s.id);
        const borderStyle: React.CSSProperties | undefined = isSelected
          ? { borderColor: selColor }
          : inMulti
          ? { borderColor: `color-mix(in oklab, ${selColor} 60%, transparent)` }
          : undefined;
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
            style={borderStyle}
            className={`group relative cursor-pointer overflow-hidden rounded-md border-2 transition ${
              isSelected || inMulti ? "" : "border-transparent hover:border-muted-foreground"
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
  kind?: SetKind;
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
            kind={props.kind}
          />
        </section>
      ))}
    </div>
  );
}

// Strips existing --- lines, then re-inserts --- every linesPer non-empty lines,
// preserving empty lines in their original positions.
function applyDividers(text: string, linesPer: number): string {
  const lines = text.replace(/^---\s*$/gm, "").split("\n");
  const out: string[] = [];
  let nonEmptyCount = 0;
  for (const line of lines) {
    if (line.trim() !== "") {
      if (nonEmptyCount > 0 && nonEmptyCount % linesPer === 0) {
        out.push("---");
      }
      nonEmptyCount++;
    }
    out.push(line);
  }
  // Trim trailing blank lines / dividers
  while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
  while (out.length > 0 && out[out.length - 1] === "---") out.pop();
  return out.join("\n");
}

// Parses lyrics using only --- as slide breaks, never re-splitting by linesPer.
// Lines matching /^\[.+\]$/ set the current group label for following slides.
// Used for the live right-column preview on every keystroke.
function parseLyricsFromText(text: string): Slide[] {
  const rawLines = text.split("\n");
  const slides: Slide[] = [];
  let currentSection: string | undefined;
  let currentLines: string[] = [];

  const flushSlide = () => {
    const content = currentLines.join("\n").trim();
    if (content) {
      slides.push({
        id: uid(),
        kind: "lyric" as const,
        lines: content.split("\n").map((l) => l.trim()),
        section: currentSection,
      });
    }
    currentLines = [];
  };

  for (const line of rawLines) {
    if (/^---\s*$/.test(line)) {
      flushSlide();
    } else if (/^\[.+\]$/.test(line.trim())) {
      flushSlide();
      currentSection = line.trim().slice(1, -1);
    } else {
      currentLines.push(line);
    }
  }
  flushSlide();
  return slides;
}

function lyricsToSlides(text: string): Slide[] {
  return parseLyricsFromText(text);
}

// Parses scripture textarea format into slides.
// Lines matching /^\[.+\]$/ set the current verse reference.
// --- forces a slide boundary; versesPer groups verses within each segment.
// Segments with no [ref] inherit the last seen ref from previous segments.
function parseScriptureFromText(text: string, versesPer: number): Slide[] {
  const segments = text.split(/^---\s*$/m);
  const slides: Slide[] = [];
  let inheritedRef = "";

  for (const segment of segments) {
    const verses: { ref: string; lines: string[] }[] = [];
    let currentRef = inheritedRef;
    let currentLines: string[] = [];

    const flushVerse = () => {
      const content = currentLines.join("\n").trim();
      if (content || currentRef) {
        verses.push({ ref: currentRef, lines: content ? content.split("\n") : [] });
      }
      currentLines = [];
    };

    for (const line of segment.split("\n")) {
      if (/^\[.+\]$/.test(line.trim())) {
        flushVerse();
        currentRef = line.trim().slice(1, -1);
        inheritedRef = currentRef;
      } else {
        currentLines.push(line);
      }
    }
    flushVerse();

    for (let i = 0; i < verses.length; i += versesPer) {
      const group = verses.slice(i, i + versesPer);
      const lines = group.flatMap((v) => v.lines);
      if (lines.length === 0) continue;
      slides.push({
        id: uid(),
        kind: "scripture" as const,
        reference: group[0].ref,
        lines,
        section: group[0].ref,
      });
    }
  }
  return slides;
}

function Importers({ setId, kind }: { setId: string; kind: SetKind }) {
  const { addSlide, updateSet } = useLibrary();

  const [linesPer, setLinesPer] = useState<number>(() => {
    const stored = localStorage.getItem("phyto_lines_per_slide");
    return stored ? Math.max(1, Number(stored) || 2) : 2;
  });
  const [lyrics, setLyrics] = useState("");
  const prevLinesPer = useRef(linesPer);

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

  // On mount: reconstruct textarea from existing slides.
  const initialised = useRef(false);
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    const currentSlides = useLibrary.getState().sets[setId]?.slides ?? [];
    if (currentSlides.length === 0) return;

    if (kind === "song") {
      let prevSection: string | undefined;
      const parts: string[] = [];
      for (const s of currentSlides) {
        if (s.section !== prevSection) {
          if (s.section) parts.push(`[${s.section}]`);
          prevSection = s.section;
        }
        parts.push(s.lines?.join("\n") ?? "");
      }
      setLyrics(parts.join("\n---\n"));
    } else if (kind === "scripture") {
      const slideParts: string[] = [];
      let lastRef = "";
      for (const s of currentSlides) {
        const ref = s.reference ?? "";
        const text = (s.lines ?? []).join("\n");
        slideParts.push(ref !== lastRef ? `[${ref}]\n${text}` : text);
        lastRef = ref;
      }
      setManualText(slideParts.join("\n---\n"));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist linesPer across navigations.
  useEffect(() => {
    localStorage.setItem("phyto_lines_per_slide", String(linesPer));
  }, [linesPer]);

  // Live sync: replace all slides whenever lyrics change (song only).
  useEffect(() => {
    if (kind !== "song") return;
    const slides = lyrics.trim() ? lyricsToSlides(lyrics) : [];
    updateSet(setId, { slides });
  }, [lyrics, kind, setId, updateSet]);

  // Live sync: replace all slides whenever scripture textarea changes.
  useEffect(() => {
    if (kind !== "scripture") return;
    const slides = manualText.trim() ? parseScriptureFromText(manualText, versesPer) : [];
    updateSet(setId, { slides });
  }, [manualText, versesPer, kind, setId, updateSet]);

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

  const importScripture = async () => {
    if (!ref.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const { reference, verses } = await fetchScriptureBolls(ref, translation, {
        removeLineBreaks: !keepLineBreaks,
      });
      const labelled = `${reference} ${translation}`;
      const parts: string[] = [];
      for (let i = 0; i < verses.length; i += versesPer) {
        if (i > 0) parts.push("---");
        const group = verses.slice(i, i + versesPer);
        const verseTexts = group.map((v) => v.text.trim()).join(" ");
        parts.push(i === 0 ? `[${labelled}]\n${verseTexts}` : verseTexts);
      }
      setManualText(parts.join("\n\n"));
      updateSet(setId, { name: labelled });
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
      if (url) addSlide(setId, { kind: "image", imageUrl: url, lines: [] });
    });
  };

  if (kind === "song") {
    return (
      <div className="flex h-full flex-col gap-0 overflow-hidden">
        {/* Search bar */}
        <div className="shrink-0 border-b border-foreground/20 p-4">
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
          {songResults.length > 0 && (
            <div className="mt-2 max-h-56 space-y-1 overflow-auto rounded-2xl border border-foreground bg-background p-1">
              {songResults.map((s, idx) => (
                <button
                  key={`${s.title}-${s.artist}-${idx}`}
                  onClick={() => {
                    setLyrics(applyDividers(s.lyrics, linesPer));
                    setSongResults([]);
                    updateSet(setId, { name: s.title });
                  }}
                  className="group flex w-full items-center gap-2 rounded-xl p-2 text-left text-sm transition hover:bg-muted"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{s.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {s.artist}{s.album ? ` · ${s.album}` : ""}
                    </div>
                  </div>
                  <Plus className="h-4 w-4 opacity-40 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          )}

          {/* Lines per slide */}
          <div className="mt-3 flex items-center gap-2">
            <span className="mono text-[10px] uppercase tracking-wider">Lines per slide</span>
            <input
              type="number"
              min={1}
              max={8}
              value={linesPer}
              onChange={(e) => {
                const next = Math.max(1, Number(e.target.value) || 1);
                if (lyrics.trim()) {
                  const ok = confirm(
                    "This will reset your slide dividers. Your text edits will be kept. Continue?"
                  );
                  if (ok) {
                    prevLinesPer.current = next;
                    setLinesPer(next);
                    setLyrics(applyDividers(lyrics, next));
                  } else {
                    setLinesPer(prevLinesPer.current);
                  }
                } else {
                  prevLinesPer.current = next;
                  setLinesPer(next);
                }
              }}
              className="pill h-7 w-16 border border-foreground bg-background px-3 text-xs outline-none"
            />
          </div>
        </div>

        {/* Lyrics textarea — fills remaining height */}
        <div className="min-h-0 flex-1 overflow-hidden">
          <Textarea
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            placeholder={`Paste lyrics here, or select a song above.\nUse --- on its own line to split slides.`}
            className="mono h-full w-full resize-none rounded-none border-0 bg-transparent px-5 py-4 text-xs shadow-none focus-visible:ring-0"
          />
        </div>
      </div>
    );
  }

  if (kind === "scripture") {
    return (
      <div className="flex h-full flex-col gap-0 overflow-hidden">
        {/* API lookup section */}
        <div className="shrink-0 border-b border-foreground/20 p-4">
          <PillInput value={ref} onChange={setRef} placeholder="e.g. John 3, John 3:16-18, John 3:21-John 4:2" />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="mono mb-1 text-[10px] uppercase tracking-wider">Version</div>
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
                max={3}
                value={versesPer}
                onChange={(e) =>
                  setVersesPer(Math.min(3, Math.max(1, Number(e.target.value) || 1)))
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
        </div>

        {/* Verses textarea — fills remaining height, live sync */}
        <div className="min-h-0 flex-1 overflow-hidden">
          <Textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder={"Paste verses here, or import above.\n\n[John 3:16-17]\nFor God so loved the world…\n---\nFor God did not send his Son…"}
            className="mono h-full w-full resize-none rounded-none border-0 bg-transparent px-5 py-4 text-xs shadow-none focus-visible:ring-0"
          />
        </div>
      </div>
    );
  }

  return <MediaImporter setId={setId} onImport={importImages} />;
}

async function pdfToImageUrls(file: File): Promise<string[]> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const urls: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport }).promise;
      urls.push(canvas.toDataURL("image/jpeg"));
    } catch {
      // skip failed pages silently
    }
  }

  return urls;
}

function MediaImporter({
  setId,
  onImport,
}: {
  setId: string;
  onImport: (files: FileList | null) => void;
}) {
  const { addSlide } = useLibrary();
  const [over, setOver] = useState(false);
  const [converting, setConverting] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || converting) return;
    const imageFiles = Array.from(files).filter((f) =>
      /^image\/(png|jpe?g|webp|gif|bmp)$/i.test(f.type)
    );
    const pdfFiles = Array.from(files).filter((f) => f.type === "application/pdf");

    if (imageFiles.length > 0) {
      const imageList = new DataTransfer();
      imageFiles.forEach((f) => imageList.items.add(f));
      onImport(imageList.files);
    }

    if (pdfFiles.length > 0) {
      setConverting(true);
      for (const pdf of pdfFiles) {
        try {
          const urls = await pdfToImageUrls(pdf);
          urls.forEach((url) =>
            addSlide(setId, { kind: "image", imageUrl: url, lines: [] })
          );
        } catch {
          // skip failed files silently
        }
      }
      setConverting(false);
    }
  };

  return (
    <PanelCard label="Import images">
      <label
        onDragOver={(e) => {
          if (converting) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!converting && e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
        }}
        className={`mono flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-xs uppercase tracking-wider transition ${
          converting
            ? "cursor-wait border-foreground/30 text-muted-foreground"
            : over
            ? "border-foreground bg-foreground/5"
            : "border-foreground/60 text-muted-foreground hover:border-foreground"
        }`}
      >
        {converting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Converting…
          </>
        ) : over ? (
          "Drop to upload"
        ) : (
          "Drop images or PDFs here or click to browse"
        )}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,application/pdf"
          multiple
          disabled={converting}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>
    </PanelCard>
  );
}

function AddToGathering({ setId }: { setId: string }) {
  const playlists = useLibrary((s) => s.playlists);
  const playlistOrder = useLibrary((s) => s.playlistOrder);
  const addSetToPlaylist = useLibrary((s) => s.addSetToPlaylist);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ids = q
      ? playlistOrder.filter((pid) => playlists[pid]?.name.toLowerCase().includes(q))
      : playlistOrder;
    return ids.map((pid) => playlists[pid]).filter(Boolean);
  }, [query, playlists, playlistOrder]);

  return (
    <div className="relative">
      <div className="pill flex items-center gap-2 border border-foreground bg-background px-4 py-2">
        <Search className="h-4 w-4" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setAdded(null); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={added ? `Added to ${added}` : "Add to a gathering…"}
          className="mono w-44 bg-transparent text-sm italic outline-none placeholder:text-muted-foreground"
        />
      </div>
      {open && matches.length > 0 && (
        <div className="absolute right-0 z-10 mt-1 max-h-60 w-72 overflow-auto rounded-2xl border border-foreground bg-popover shadow-md">
          {matches.map((p) => (
            <button
              key={p.id}
              onMouseDown={(e) => {
                e.preventDefault();
                addSetToPlaylist(p.id, setId);
                setAdded(p.name);
                setQuery("");
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <span className="truncate">{p.name}</span>
              <span className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {p.setIds.length} sets
              </span>
            </button>
          ))}
        </div>
      )}
      {open && matches.length === 0 && (
        <div className="absolute right-0 z-10 mt-1 w-72 rounded-2xl border border-foreground bg-popover px-3 py-2 text-sm text-muted-foreground shadow-md">
          No gatherings found.
        </div>
      )}
    </div>
  );
}
