import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLibrary, useSongTemplateDraft, useScriptureTemplateDraft } from "@/lib/store";
import { SongTemplateEditor } from "@/components/SongTemplateEditor";
import { ScriptureTemplateEditor } from "@/components/ScriptureTemplateEditor";
import { parseYouTubeId } from "@/lib/parsers";
import { supabase } from "@/lib/supabase";
import {
  IMAGE_MAX_DIM,
  IMAGE_QUALITY,
  MEDIA_MAX_BYTES,
  isUploadableImage,
  isUploadableVideo,
} from "@/lib/media";
import { prepareImageFile, prepareRenderedImage } from "@/lib/image-upload";
import { fetchScriptureBolls, TRANSLATIONS } from "@/lib/bible";
import { searchSongs, preloadSongs, parseQuery, songPreview, type SongResult } from "@/lib/songs";
import {
  lyricsToSlides,
  parseScriptureFromText,
  reconcileSlideIds,
  slidesToLyricsText,
  slidesToScriptureText,
} from "@/lib/slide-text";
import { SlideView } from "@/components/SlideView";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChordLine } from "@/components/ChordLine";
import {
  chordToNumber,
  diatonicChords,
  stripChords,
  hideChords,
  lyricsToNumbers,
  normaliseKeyTag,
  numbersToLyrics,
  reapplyChords,
  guessKey,
  hasChords,
  isChordOnlyLine,
  KEYS,
  normaliseChordSheet,
  renderChord,
  transposeLyrics,
  type SongChords,
} from "@/lib/chords";
import {
  ArrowUpLeft,
  ArrowUpRight,
  Plus,
  Trash2,
  GripVertical,
  Search,
  Loader2,
  ChevronDown,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Slide, SetKind } from "@/lib/types";
import { z } from "zod";
import { APP_NAME } from "@/lib/appConfig";

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
    meta: [{ title: `Set Editor | ${APP_NAME}` }, { name: "robots", content: "noindex" }],
  }),
  component: SetEditor,
});

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
      {label && <h3 className="mono mb-4 text-xs uppercase tracking-wider">{label}</h3>}
      {children}
    </section>
  );
}

/**
 * Search the catalogue's songs from inside the editor and jump straight to one,
 * so working through a set list doesn't mean going home between every song.
 * Songs only: scripture and media have different editors.
 */
function SongJump({
  currentId,
  navigate,
}: {
  currentId: string;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const sets = useLibrary((s) => s.sets);
  const order = useLibrary((s) => s.order);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const needle = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!needle) return [];
    const out: { id: string; name: string }[] = [];
    for (const id of order) {
      const d = sets[id];
      if (!d || d.kind !== "song" || d.id === currentId) continue;
      const inName = d.name.toLowerCase().includes(needle);
      const inLyrics =
        !inName &&
        d.slides.some((sl) => sl.lines?.some((l) => stripChords(l).toLowerCase().includes(needle)));
      if (inName || inLyrics) out.push({ id: d.id, name: d.name });
      if (out.length >= 8) break;
    }
    return out;
  }, [needle, order, sets, currentId]);

  const go = (id: string) => {
    setQuery("");
    setOpen(false);
    navigate({ to: "/set/$setId", params: { setId: id } });
  };

  return (
    <div ref={boxRef} className="relative shrink-0">
      <div className="pill flex h-9 w-52 items-center gap-2 border border-foreground bg-background px-3">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && results[0]) go(results[0].id);
          }}
          placeholder="Go to song"
          className="mono uppercase w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
      </div>

      {open && needle !== "" && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-2xl border border-foreground bg-background shadow-lg">
          {results.length === 0 ? (
            <p className="mono px-3 py-2.5 text-[11px] text-muted-foreground">No songs match.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto p-1">
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => go(r.id)}
                  className="block w-full truncate rounded-xl px-2.5 py-2 text-left text-sm transition hover:bg-muted"
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
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
  const [showDeleteSetDialog, setShowDeleteSetDialog] = useState(false);
  const nameBeforeEditRef = useRef(phytoSet.name);
  const commitName = () => {
    if (!phytoSet.name.trim()) {
      updateSet(phytoSet.id, { name: nameBeforeEditRef.current });
    }
    setEditingName(false);
  };
  // Gathering this set was added to during this edit session; the Present button
  // jumps there instead of presenting the set on its own. Most recent wins.
  const [presentGatheringId, setPresentGatheringId] = useState<string | null>(null);
  // Opened from the presenter — Back returns there, and we hide Present so the
  // only way out is Back (to wherever they came from).
  const fromPresenter = !!redirectTo?.startsWith("/present");
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-foreground px-6 py-4">
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
            placeholder="Set name"
            onChange={(e) => updateSet(phytoSet.id, { name: e.target.value })}
            onBlur={commitName}
            onKeyDown={(e) => e.key === "Enter" && commitName()}
            className="h-9 w-56 border-foreground text-base shadow-none focus-visible:ring-0"
          />
        ) : (
          <h1
            onClick={() => {
              nameBeforeEditRef.current = phytoSet.name;
              setEditingName(true);
            }}
            className="cursor-text truncate text-base text-muted-foreground"
            title="Click to rename"
          >
            {phytoSet.name}
          </h1>
        )}

        <span
          className={`pill mono shrink-0 px-2.5 py-0.5 text-[10px] uppercase tracking-wider ${kindBadgeBg(phytoSet.kind)}`}
        >
          {phytoSet.kind}
        </span>
      </div>

      {phytoSet.kind === "song" && <SongJump currentId={phytoSet.id} navigate={navigate} />}

      <div className="flex-1" />

      {/* Right actions */}
      <button
        onClick={() => setShowDeleteSetDialog(true)}
        className="mono uppercase pill shrink-0 bg-[var(--brand-red)] px-4 py-2 text-xs text-[var(--brand-white)] transition hover:opacity-90"
      >
        Delete
      </button>
      <AlertDialog open={showDeleteSetDialog} onOpenChange={setShowDeleteSetDialog}>
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          <AlertDialogTitle className="text-2xl font-normal leading-tight">
            Delete this set?
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            This cannot be undone.
          </AlertDialogDescription>
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => {
                deleteSet(phytoSet.id);
                navigate({ to: redirectTo ?? "/" });
              }}
              className="mono uppercase flex-1 rounded-full bg-[var(--brand-red)] py-2 text-sm text-[var(--brand-white)] transition hover:opacity-90"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteSetDialog(false)}
              className="mono uppercase flex-1 rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
            >
              Cancel
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      <AddToGathering setId={phytoSet.id} onAdded={setPresentGatheringId} />
      {!fromPresenter && (
        <button
          onClick={() =>
            navigate({
              to: "/present",
              search: presentGatheringId ? { gathering: presentGatheringId } : { set: phytoSet.id },
            })
          }
          className="pill mono uppercase flex shrink-0 items-center gap-2 border border-foreground px-5 py-2 text-sm transition hover:bg-foreground hover:text-background"
        >
          Present <ArrowUpRight className="h-4 w-4" />
        </button>
      )}
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
  const scriptureTemplate = useLibrary((s) => s.scriptureTemplate);
  const scriptureDraft = useScriptureTemplateDraft((s) => s.draft);
  const effectiveScriptureTemplate = scriptureDraft ?? scriptureTemplate;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [multiSel, setMultiSel] = useState<Set<string>>(new Set());
  const [groupView, setGroupView] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [showFileSizeDialog, setShowFileSizeDialog] = useState(false);
  const [showStorageLimitDialog, setShowStorageLimitDialog] = useState(false);
  const [fileOver, setFileOver] = useState(false);
  const [converting, setConverting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [videoLink, setVideoLink] = useState("");
  const [videoErr, setVideoErr] = useState<string | null>(null);

  const selected = useMemo(
    () => phytoSet?.slides.find((s) => s.id === selectedId) ?? phytoSet?.slides[0] ?? null,
    [phytoSet, selectedId],
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
        if (next) {
          setSelectedId(next.id);
          setMultiSel(new Set([next.id]));
        }
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = phytoSet.slides.findIndex((s) => s.id === (selected?.id ?? ""));
        const prev = phytoSet.slides[Math.max(0, idx - 1)];
        if (prev) {
          setSelectedId(prev.id);
          setMultiSel(new Set([prev.id]));
        }
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
          <Link to="/" className="mt-3 inline-block underline">
            Back to library
          </Link>
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
            {/* Keyed so navigating straight to another song remounts the editor.
                Without it the box would keep the previous song's lyrics and the
                live-sync effect would write them over the new song's slides. */}
            <Importers key={phytoSet.id} setId={phytoSet.id} kind={phytoSet.kind} />
          </div>
          {/* Right: template editor + live slide grid */}
          <div className="w-1/2 overflow-y-auto p-6">
            <div className="mb-4">
              <SongTemplateEditor />
            </div>
            {phytoSet.chords && !phytoSet.chords.hidden && phytoSet.slides.length > 0 && (
              <ChordSheet slides={phytoSet.slides} chords={phytoSet.chords} />
            )}
            {phytoSet.slides.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Slides will appear here as you type
              </p>
            ) : (
              (() => {
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
                          style={{
                            backgroundColor: `color-mix(in oklab, ${TINTS[gi % 3]} 20%, transparent)`,
                          }}
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
              })()
            )}
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
            {/* Keyed so navigating straight to another song remounts the editor.
                Without it the box would keep the previous song's lyrics and the
                live-sync effect would write them over the new song's slides. */}
            <Importers key={phytoSet.id} setId={phytoSet.id} kind={phytoSet.kind} />
          </div>
          {/* Right: template editor + live slide grid */}
          <div className="w-1/2 overflow-y-auto p-6">
            <div className="mb-4">
              <ScriptureTemplateEditor />
            </div>
            {phytoSet.slides.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Slides will appear here as you type
              </p>
            ) : (
              (() => {
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
                          style={{
                            backgroundColor: `color-mix(in oklab, ${TINTS[gi % 3]} 20%, transparent)`,
                          }}
                        >
                          <div className="grid grid-cols-2 gap-2">
                            {g.slides.map((s) => (
                              <div key={s.id} className="overflow-hidden rounded-md">
                                <SlideView
                                  slide={s}
                                  variant="thumb"
                                  template={effectiveScriptureTemplate}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()
            )}
          </div>
        </div>
      </div>
    );
  }

  // Media: merged import + slides panel
  const dense = phytoSet.slides.length > 20;

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

  // Uploads a single video file to R2 via the server route, then adds a slide
  // pointing at the returned public URL. Returns false on any failure.
  const uploadVideoFile = async (file: File): Promise<boolean> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setVideoErr("Please sign in to upload videos.");
      return false;
    }
    try {
      const res = await fetch("/api/media/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type },
        body: file,
      });
      const json = (await res.json()) as {
        ok?: boolean;
        url?: string;
        error?: string;
        code?: string;
      };
      if (!res.ok || !json.ok || !json.url) {
        if (json.code === "quota") {
          setShowStorageLimitDialog(true);
        } else {
          setVideoErr(json.error ?? "Upload failed.");
        }
        return false;
      }
      addSlide(phytoSet.id, { kind: "video", videoSource: "file", videoUrl: json.url, lines: [] });
      return true;
    } catch {
      setVideoErr("Upload failed.");
      return false;
    }
  };

  // Adds a video slide from a pasted link: YouTube → embed, otherwise a direct
  // external video URL.
  const addVideoLink = () => {
    const link = videoLink.trim();
    if (!link) return;
    setVideoErr(null);
    const youtubeId = parseYouTubeId(link);
    if (youtubeId) {
      addSlide(phytoSet.id, { kind: "video", videoSource: "youtube", youtubeId, lines: [] });
    } else if (/^https?:\/\//i.test(link)) {
      addSlide(phytoSet.id, { kind: "video", videoSource: "url", videoUrl: link, lines: [] });
    } else {
      setVideoErr("Enter a YouTube link or a direct video URL.");
      return;
    }
    setVideoLink("");
  };

  const handleMediaFiles = async (files: FileList | null) => {
    if (!files || converting || uploading) return;
    setVideoErr(null);
    const all = Array.from(files);
    const videoFiles = all.filter((f) => isUploadableVideo(f.type));
    const nonVideo = all.filter((f) => !isUploadableVideo(f.type));

    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (
      nonVideo.some((f) => f.size > MAX_FILE_SIZE) ||
      videoFiles.some((f) => f.size > MEDIA_MAX_BYTES)
    ) {
      setShowFileSizeDialog(true);
      return;
    }

    if (videoFiles.length > 0) {
      setUploading(true);
      for (const file of videoFiles) {
        await uploadVideoFile(file);
      }
      setUploading(false);
    }

    const imageFiles = nonVideo.filter((f) => /^image\/(png|jpe?g|webp|gif|bmp)$/i.test(f.type));
    const pdfFiles = nonVideo.filter((f) => f.type === "application/pdf");

    if (imageFiles.length > 0) {
      setUploading(true);
      for (const file of imageFiles) {
        const img = await prepareImageFile(file, () => setShowStorageLimitDialog(true));
        if (img) addSlide(phytoSet.id, { kind: "image", imageUrl: img.url, lines: [] });
      }
      setUploading(false);
    }

    if (pdfFiles.length > 0) {
      setConverting(true);
      for (const pdf of pdfFiles) {
        try {
          for (const blob of await pdfToImageBlobs(pdf)) {
            const img = await prepareRenderedImage(blob, () => setShowStorageLimitDialog(true));
            if (img) addSlide(phytoSet.id, { kind: "image", imageUrl: img.url, lines: [] });
          }
        } catch {
          // skip failed files silently
        }
      }
      setConverting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SetHeader {...headerProps} />

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8 md:px-10 lg:grid-cols-[1fr_340px]">
        <div>
          {/* Merged import + slides panel */}
          <section
            className={`rounded-3xl border bg-background p-5 transition ${fileOver ? "border-foreground ring-2 ring-foreground" : "border-foreground"}`}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("Files")) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                setFileOver(true);
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setFileOver(false);
              if (e.dataTransfer.files?.length) handleMediaFiles(e.dataTransfer.files);
            }}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="mono text-xs uppercase tracking-wider">
                Slides ({phytoSet.slides.length})
                {multiSel.size > 0 && (
                  <span className="ml-2 text-foreground">· {multiSel.size} selected</span>
                )}
              </h2>
              <div className="flex items-center gap-2">
                {multiSel.size > 0 && (
                  <button
                    onClick={deleteSelected}
                    className="pill flex items-center gap-1 bg-[var(--brand-red)] px-3 py-1.5 text-xs text-[var(--brand-white)]"
                  >
                    <Trash2 className="h-3 w-3" /> Delete selected
                  </button>
                )}
              </div>
            </div>

            <div className="mb-3 flex flex-col gap-1">
              <div className="pill flex items-center gap-2 border border-foreground bg-background px-3 py-1.5">
                <input
                  value={videoLink}
                  onChange={(e) => setVideoLink(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addVideoLink();
                    }
                  }}
                  placeholder="PASTE A YOUTUBE OR VIDEO LINK"
                  className="mono w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                />
                <button
                  onClick={addVideoLink}
                  disabled={!videoLink.trim()}
                  className="flex items-center transition disabled:opacity-20"
                  aria-label="Add video link"
                >
                  <Plus className="h-4 w-4 opacity-40 hover:opacity-100" />
                </button>
              </div>
              {videoErr && <p className="text-xs text-destructive">{videoErr}</p>}
            </div>

            {phytoSet.slides.length === 0 ? (
              <label
                className={`mono flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-xs uppercase tracking-wider transition ${
                  converting || uploading
                    ? "cursor-wait border-foreground/30 text-muted-foreground"
                    : fileOver
                      ? "border-foreground bg-foreground/5"
                      : "border-foreground/60 text-muted-foreground hover:border-foreground"
                }`}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
                  </>
                ) : converting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Converting…
                  </>
                ) : fileOver ? (
                  "Drop to upload"
                ) : (
                  "Drop images, PDFs or videos here or click to browse"
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,application/pdf,video/mp4,video/quicktime,video/webm"
                  multiple
                  disabled={converting || uploading}
                  className="hidden"
                  onChange={(e) => handleMediaFiles(e.target.files)}
                />
              </label>
            ) : (
              <div className="max-h-[calc(100vh-300px)] overflow-y-auto pr-1">
                {(fileOver || uploading) && (
                  <p className="mono mb-3 text-center text-xs uppercase tracking-wider text-muted-foreground">
                    {uploading ? "Uploading…" : "Drop to add media"}
                  </p>
                )}
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
          </section>
        </div>

        <aside className="space-y-5">
          <div>
            <div className="mono mb-3 text-xs uppercase tracking-wider">Preview</div>
            <div className="overflow-hidden rounded-lg bg-[var(--brand-black)]">
              <SlideView slide={selected} variant="preview" />
            </div>
            {selected?.kind === "video" && (
              <label className="mt-3 flex cursor-pointer items-center justify-between gap-2 text-xs">
                <span className="mono uppercase tracking-wider text-muted-foreground">
                  Autoplay when live
                </span>
                <input
                  type="checkbox"
                  checked={!!selected.autoplay}
                  onChange={(e) =>
                    updateSlide(phytoSet.id, selected.id, { autoplay: e.target.checked })
                  }
                  className="h-4 w-4 accent-[var(--brand-orange)]"
                />
              </label>
            )}
          </div>
        </aside>
      </div>

      <AlertDialog open={showFileSizeDialog} onOpenChange={setShowFileSizeDialog}>
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          <AlertDialogTitle className="text-2xl font-normal leading-tight">
            File too large
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            One or more files exceeds the limit (5 MB for images and PDFs, 100 MB for videos).
            Please resize or compress your files and try again.
          </AlertDialogDescription>
          <div className="mt-8 flex justify-end">
            <button
              type="button"
              onClick={() => setShowFileSizeDialog(false)}
              className="mono uppercase rounded-full border border-foreground bg-transparent px-8 py-2 text-sm transition hover:bg-foreground hover:text-background"
            >
              OK
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={showStorageLimitDialog} onOpenChange={setShowStorageLimitDialog}>
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          <AlertDialogTitle className="text-2xl font-normal leading-tight">
            Storage limit reached
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            Each account can store up to 300 MB of video. To make room for this upload, delete some
            of your previous videos, images, or slides, then try again.
          </AlertDialogDescription>
          <div className="mt-8 flex justify-end">
            <button
              type="button"
              onClick={() => setShowStorageLimitDialog(false)}
              className="mono uppercase rounded-full border border-foreground bg-transparent px-8 py-2 text-sm transition hover:bg-foreground hover:text-background"
            >
              OK
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PillInput({
  value,
  onChange,
  placeholder,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onEnter?: () => void;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
      placeholder={placeholder}
      className="pill mono uppercase w-full border border-foreground bg-background px-4 py-1.5 text-sm outline-none focus:ring-1 focus:ring-foreground"
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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [liveOrder, setLiveOrder] = useState<Slide[] | null>(null);
  const liveOrderRef = useRef<Slide[] | null>(null);
  const dragIndex = useRef<number | null>(null);

  const cols = dense ? "grid-cols-3 md:grid-cols-4" : "grid-cols-2 md:grid-cols-4";
  const selColor = kindColor(kind);
  const displaySlides = liveOrder ?? slides;

  const commitOrder = () => {
    if (liveOrderRef.current) onReorder(liveOrderRef.current.map((s) => s.id));
    liveOrderRef.current = null;
    setLiveOrder(null);
    setDraggingId(null);
    dragIndex.current = null;
  };

  return (
    <div
      className={`grid gap-3 ${cols}`}
      onDrop={(e) => {
        if (e.dataTransfer.files?.length) return;
        e.stopPropagation();
        commitOrder();
      }}
    >
      {displaySlides.map((s, i) => {
        const isSelected = selectedId === s.id;
        const inMulti = multiSel.has(s.id);
        const isDragging = s.id === draggingId;
        const borderStyle: React.CSSProperties | undefined = isSelected
          ? { borderColor: selColor }
          : inMulti
            ? { borderColor: `color-mix(in oklab, ${selColor} 60%, transparent)` }
            : undefined;
        return (
          <div
            key={s.id}
            draggable
            onDragStart={(e) => {
              setDraggingId(s.id);
              dragIndex.current = i;
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (dragIndex.current === null) return;
              e.preventDefault();
              e.stopPropagation();
              const current = liveOrder ?? slides;
              const fromIdx = current.findIndex((x) => x.id === draggingId);
              if (fromIdx === i || fromIdx === -1) return;
              const next = [...current];
              const [moved] = next.splice(fromIdx, 1);
              next.splice(i, 0, moved);
              liveOrderRef.current = next;
              setLiveOrder(next);
            }}
            onDragEnd={commitOrder}
            onClick={(e) => onSelect(s.id, e)}
            style={borderStyle}
            className={`group relative cursor-grab overflow-hidden rounded-md border-2 transition ${
              isDragging ? "opacity-50" : ""
            } ${isSelected || inMulti ? "" : "border-transparent hover:border-muted-foreground"}`}
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

// Strips existing --- lines, then re-inserts --- every linesPer non-empty lines,
// preserving empty lines in their original positions.
function applyDividers(text: string, linesPer: number): string {
  const lines = text.replace(/^---\s*$/gm, "").split("\n");
  const out: string[] = [];
  let countInGroup = 0;

  const endGroup = () => {
    if (countInGroup > 0) {
      out.push("---");
      countInGroup = 0;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      endGroup(); // stanza break → end slide cleanly, drop the blank line
      continue;
    }
    if (/^\[.+\]$/.test(line)) {
      endGroup(); // section header ends the previous group, doesn't count
      out.push(line);
      continue;
    }
    if (isChordOnlyLine(line)) {
      // An instrumental line projects nothing, so it isn't a lyric line —
      // it rides along with the current slide without using up its quota.
      out.push(line);
      continue;
    }
    if (countInGroup > 0 && countInGroup % linesPer === 0) {
      out.push("---");
    }
    out.push(line);
    countInGroup++;
  }

  while (out.length > 0 && out[out.length - 1] === "---") out.pop();
  return out.join("\n");
}

/**
 * Chord settings for a song. Chords are typed inline in the lyrics as `(G)`;
 * this panel records the key they were written in and picks how they render on
 * people's phones — as letters (optionally transposed) or Nashville numbers.
 * Nothing here rewrites the lyrics, so every choice is reversible.
 */
function ChordControls({
  setId,
  lyrics,
  onLyricsChange,
  onInsertChord,
  children,
}: {
  setId: string;
  lyrics: string;
  /** Used to rewrite every chord in the lyrics when the key changes. */
  onLyricsChange: (next: string) => void;
  /** Drop a chord in at the caret, from the palette below. */
  onInsertChord: (chord: string) => void;
  /** Rendered to the left of the Chords switch, sharing its row. */
  children?: ReactNode;
}) {
  const updateSet = useLibrary((s) => s.updateSet);
  const chords = useLibrary((s) => s.sets[setId]?.chords);
  const shown = !!chords && !chords.hidden;
  const detected = hasChords(lyrics);

  // Transposing rewrites the chords in the lyrics themselves and carries `key`
  // along with them, so the Key box always states what is actually stored.
  // That is what lets numbers be derived without a separate "written in" key.
  const changeKey = (next: string) => {
    if (!chords || next === chords.key) return;
    onLyricsChange(transposeLyrics(lyrics, chords.key, next));
    updateSet(setId, { chords: { ...chords, key: next } });
  };

  // NB: turning chords on automatically is driven from handleLyricsChange, not
  // from an effect on `lyrics`. `lyrics` starts empty and is only then filled in
  // from the stored slides, so an effect would fire on mount and write to the
  // set just for opening the editor — the phantom-conflict bug fixed in 01dff4e.

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        {children}
        <span className="mono text-[10px] uppercase tracking-wider">Chords</span>
        <Switch
          checked={shown}
          onCheckedChange={(on) =>
            updateSet(setId, {
              chords: {
                ...(chords ?? { key: guessKey(lyrics) ?? "G", display: "letters" as const }),
                hidden: !on,
              },
            })
          }
          aria-label="Show chords"
        />
      </div>

      {shown && chords && (
        <div className="mt-3 space-y-3 border-t border-foreground/15 pt-3">
          <p className="mono text-[10px] leading-relaxed text-muted-foreground">
            Paste a chord sheet, or type chords in round brackets:{" "}
            <span className="text-foreground">Amazing (G)grace</span>. They never show on the
            projector.
          </p>

          <div className="flex items-center gap-2">
            {(["letters", "numbers"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => updateSet(setId, { chords: { ...chords, display: d } })}
                className={`pill mono h-7 border border-foreground px-3 text-xs uppercase transition ${
                  chords.display === d
                    ? "bg-foreground text-background"
                    : "bg-background hover:bg-muted"
                }`}
              >
                {d}
              </button>
            ))}

            {chords.display === "letters" && (
              <>
                <span className="mono ml-1 shrink-0 text-[10px] uppercase tracking-wider">Key</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    {/* pr sits wider than pl so the chevron tucks in from the
                        pill's right edge rather than hugging it. */}
                    <button className="pill mono uppercase flex h-7 items-center gap-1.5 border border-foreground bg-background pl-3 pr-2.5 text-xs tracking-wider transition hover:bg-muted">
                      {chords.key}
                      <ChevronDown className="h-3 w-3 shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-0">
                    {KEYS.map((k) => (
                      <DropdownMenuItem
                        key={k}
                        onClick={() => changeKey(k)}
                        className="mono uppercase text-xs tracking-wider focus:bg-[var(--brand-blue)] focus:text-[var(--brand-white)]"
                      >
                        {k}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>

          {/* The seven chords of the key. Click to drop one in at the caret;
              mousedown is swallowed so the textarea keeps focus and the caret
              stays where the user left it. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {diatonicChords(chords.key).map((c) => (
              <button
                key={c}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertChord(c)}
                title={`Insert ${c}`}
                className="mono flex h-9 w-9 items-center justify-center rounded-full border border-foreground text-[10px] tracking-tight transition hover:bg-foreground hover:text-background"
              >
                {renderChord(c, chords)}
              </button>
            ))}
          </div>

          {!detected && (
            <p className="mono text-[10px] leading-relaxed text-muted-foreground">
              No chords in the lyrics yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Mirrors what the phone view shows once someone turns chords on, so the leader
 * can check placement and the chosen key without leaving the editor. The slide
 * thumbnails below deliberately never show chords — the projector doesn't.
 */
function ChordSheet({ slides, chords }: { slides: Slide[]; chords: SongChords }) {
  const groups: { label: string | undefined; lines: string[] }[] = [];
  for (const s of slides) {
    const last = groups[groups.length - 1];
    if (!last || s.section !== last.label) {
      groups.push({ label: s.section, lines: [...(s.lines ?? [])] });
    } else {
      last.lines.push(...(s.lines ?? []));
    }
  }

  return (
    <div className="mb-4 rounded-2xl border border-foreground p-4">
      <div className="mono mb-3 flex items-baseline justify-between gap-2 text-[10px] uppercase tracking-wider">
        <span>Chord sheet</span>
        <span className="text-muted-foreground">
          {chords.display === "numbers" ? "Numbers" : `Key of ${chords.key}`}
        </span>
      </div>
      <div className="max-h-72 space-y-3 overflow-y-auto pr-1 text-sm">
        {groups.map((g, i) => (
          <div key={i}>
            {g.label && (
              <div className="mono mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                {g.label}
              </div>
            )}
            <div className="space-y-1.5">
              {g.lines.map((line, j) => (
                <ChordLine
                  key={j}
                  line={line}
                  chords={chords}
                  show
                  className="leading-relaxed"
                  chordClassName="text-[0.8em] font-semibold"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Importers({ setId, kind }: { setId: string; kind: SetKind }) {
  const { addSlide, updateSet } = useLibrary();

  const [linesPer, setLinesPer] = useState<number>(() => {
    const stored = localStorage.getItem("phyto_lines_per_slide");
    return stored ? Math.max(1, Number(stored) || 2) : 2;
  });
  // Seed the textarea from the stored slides in the SAME render the component
  // mounts, so the live-sync effect's first run sees text that round-trips to
  // identical content and writes nothing. (The old mount-effect reconstruction
  // left the first sync pass running against "" — transiently writing
  // slides: [] — then rebuilt every slide with fresh ids, which changed the
  // sync fingerprint and flagged a phantom conflict on other devices.)
  const [lyrics, setLyrics] = useState(() => {
    if (kind !== "song") return "";
    return slidesToLyricsText(useLibrary.getState().sets[setId]?.slides ?? []);
  });
  const prevLinesPer = useRef(linesPer);

  const [songQuery, setSongQuery] = useState("");
  const [songResults, setSongResults] = useState<SongResult[]>([]);
  const [songSearching, setSongSearching] = useState(false);
  const [songErr, setSongErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ text: string; x: number; y: number } | null>(null);
  const searchSeq = useRef(0);
  const lyricsRef = useRef<HTMLTextAreaElement>(null);
  // Undo/redo for the lyrics box. The browser's own undo can't be used here:
  // the box is controlled and often shows a transformed view (numbers, or
  // chords hidden), so its value doesn't track the native edit history. Each
  // entry carries the chord config too, so undoing a transpose puts the key
  // back with the text rather than leaving the two disagreeing.
  const undoStack = useRef<{ lyrics: string; chords?: SongChords; caret: number | null }[]>([]);
  const redoStack = useRef<typeof undoStack.current>([]);
  const lastPush = useRef(0);
  // `lyrics` is always stored as letter chords. The box may show something else
  // — nothing at all when chords are switched off, or Nashville numbers when
  // that's the chosen display — and every edit is translated back on the way in,
  // so nothing is lost either way.
  const chordCfg = useLibrary((s) => s.sets[setId]?.chords);
  const chordsHidden = !!chordCfg?.hidden;
  const numbersMode = !!chordCfg && !chordCfg.hidden && chordCfg.display === "numbers";
  const chordKey = chordCfg?.key ?? "C";
  const boxText = chordsHidden
    ? hideChords(lyrics)
    : numbersMode
      ? lyricsToNumbers(lyrics, chordKey)
      : lyrics;
  // Last caret position in the lyrics box. Null until it has been focused, so
  // a palette click before that appends rather than landing at position 0.
  const caretRef = useRef<number | null>(null);

  const [pendingLinesPerConfirm, setPendingLinesPerConfirm] = useState<number | null>(null);
  const [versionOpen, setVersionOpen] = useState(false);

  const [ref, setRef] = useState("");
  const [translation, setTranslation] = useState("NIV");
  const [versesPer, setVersesPer] = useState(1);
  const [keepLineBreaks, setKeepLineBreaks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [manualRef, setManualRef] = useState("");
  const [manualText, setManualText] = useState(() => {
    if (kind !== "scripture") return "";
    return slidesToScriptureText(useLibrary.getState().sets[setId]?.slides ?? []);
  });

  // Late hydration: on a direct URL load Dexie may not have populated the
  // store yet, so the lazy initializers above saw no slides. Reconstruct once
  // they appear — but never clobber text the user (or an import) already put
  // in the box, and latch only after an actual reconstruction so this retries
  // until the store is ready.
  const hydrated = useRef(lyrics !== "" || manualText !== "");
  const storeSlides = useLibrary((s) => s.sets[setId]?.slides);
  useEffect(() => {
    if (hydrated.current) return;
    if (!storeSlides || storeSlides.length === 0) return;
    hydrated.current = true;
    if (kind === "song" && lyrics === "") {
      setLyrics(slidesToLyricsText(storeSlides));
    } else if (kind === "scripture" && manualText === "") {
      setManualText(slidesToScriptureText(storeSlides));
    }
  }, [storeSlides, kind, lyrics, manualText]);

  // Persist linesPer across navigations.
  useEffect(() => {
    localStorage.setItem("phyto_lines_per_slide", String(linesPer));
  }, [linesPer]);

  // Warm the local song database so the first search paints instantly.
  useEffect(() => {
    if (kind === "song") preloadSongs();
  }, [kind]);

  // Live sync: rebuild slides whenever the lyrics change (song only).
  // Reconciled against the stored slides so an unchanged round-trip keeps
  // every slide id and skips the write entirely — otherwise merely opening
  // this editor would bump updatedAt and push regenerated ids, which reads as
  // a real content conflict (`modified`, not `touched`) on other devices.
  useEffect(() => {
    if (kind !== "song") return;
    const parsed = lyrics.trim() ? lyricsToSlides(lyrics) : [];
    const current = useLibrary.getState().sets[setId]?.slides ?? [];
    const { slides, changed } = reconcileSlideIds(parsed, current);
    if (changed) updateSet(setId, { slides });
  }, [lyrics, kind, setId, updateSet]);

  // Live sync: rebuild slides whenever the scripture textarea changes.
  // Same id-preserving reconcile as the song effect above.
  useEffect(() => {
    if (kind !== "scripture") return;
    const parsed = manualText.trim() ? parseScriptureFromText(manualText, versesPer) : [];
    const current = useLibrary.getState().sets[setId]?.slides ?? [];
    const { slides, changed } = reconcileSlideIds(parsed, current);
    if (changed) updateSet(setId, { slides });
  }, [manualText, versesPer, kind, setId, updateSet]);

  const runSongSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!songQuery.trim()) return;
    const seq = ++searchSeq.current; // ignore results from superseded searches
    setSongSearching(true);
    setSongErr(null);
    try {
      // Paint instant local matches, then slot online results in as they load.
      const { local, online } = await searchSongs(songQuery);
      if (searchSeq.current === seq) setSongResults(local);
      const final = await online;
      if (searchSeq.current === seq) {
        setSongResults(final);
        if (final.length === 0)
          setSongErr("Couldn't find that song. Paste the lyrics below to add it manually.");
      }
    } catch (e) {
      if (searchSeq.current === seq) setSongErr((e as Error).message);
    } finally {
      if (searchSeq.current === seq) setSongSearching(false);
    }
  };

  // When lyrics are pasted into an empty box after a search, name the still-
  // default set from what was typed (e.g. "Inhabit by Bethel" -> "Inhabit").
  // Don't override a name the user set or one taken from a selected result.
  const snapshot = () => ({
    lyrics,
    chords: useLibrary.getState().sets[setId]?.chords,
    caret: caretRef.current,
  });

  /** Remember the current state before changing it, coalescing a burst of
   *  typing into a single undo step. */
  const pushHistory = () => {
    const now = Date.now();
    if (now - lastPush.current < 500 && undoStack.current.length > 0) return;
    lastPush.current = now;
    undoStack.current.push(snapshot());
    if (undoStack.current.length > 200) undoStack.current.shift();
    redoStack.current = [];
  };

  const restore = (entry: { lyrics: string; chords?: SongChords; caret: number | null }) => {
    setLyrics(entry.lyrics);
    const now = useLibrary.getState().sets[setId]?.chords;
    if (JSON.stringify(now) !== JSON.stringify(entry.chords)) {
      updateSet(setId, { chords: entry.chords });
    }
    lastPush.current = 0; // the next edit starts a fresh step
    if (entry.caret !== null) {
      caretRef.current = entry.caret;
      requestAnimationFrame(() => lyricsRef.current?.setSelectionRange(entry.caret!, entry.caret!));
    }
  };

  const undoLyrics = () => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    redoStack.current.push(snapshot());
    restore(entry);
  };

  const redoLyrics = () => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    undoStack.current.push(snapshot());
    restore(entry);
  };

  /** Translate what the box now contains back into stored form. */
  const commitFromBox = (val: string) =>
    handleLyricsChange(
      chordsHidden
        ? reapplyChords(lyrics, val)
        : numbersMode
          ? numbersToLyrics(val, chordKey)
          : val,
    );

  const handleLyricsChange = (val: string) => {
    pushHistory();
    const wasEmpty = !lyrics.trim();
    const hadChords = hasChords(lyrics);
    setLyrics(val);
    // Turn chords on the first time the leader actually types or pastes some.
    // Driven from here rather than an effect so opening the editor never writes.
    // A deliberate switch-off sticks: the text still has chords, so `hadChords`
    // is already true and this can't fire again.
    if (!hadChords && hasChords(val) && !useLibrary.getState().sets[setId]?.chords) {
      updateSet(setId, { chords: { key: guessKey(val) ?? "G", display: "letters" } });
    }
    if (wasEmpty && val.trim() && songQuery.trim()) {
      const current = useLibrary.getState().sets[setId];
      if (current && (current.name.trim() === "New Song" || !current.name.trim())) {
        const titled = parseQuery(songQuery).title.replace(/\b\w/g, (c) => c.toUpperCase());
        if (titled) updateSet(setId, { name: titled });
      }
    }
  };

  /**
   * Paste a chord sheet in any of the layouts these sites produce — Ultimate
   * Guitar's column-aligned chord rows, or WorshipTogether's one-chord-per-line
   * stream. Folded into the inline bracket format on the way in so the rest of
   * the app only ever deals with one representation. Anything that isn't
   * chord-shaped falls through to the browser's own paste.
   */
  const handleLyricsPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData("text");
    const folded = normaliseChordSheet(pasted);
    if (folded === pasted) return; // nothing chord-shaped — let the browser paste
    const { selectionStart, selectionEnd } = e.currentTarget;
    e.preventDefault();
    // Splice in the box's own coordinates, then let commitFromBox translate the
    // result back. `folded` carries letter chords, which survive that in any mode.
    if (chordsHidden) {
      // They would land straight out of sight otherwise.
      const current = useLibrary.getState().sets[setId]?.chords;
      if (current) updateSet(setId, { chords: { ...current, hidden: false } });
    }
    commitFromBox(boxText.slice(0, selectionStart) + folded + boxText.slice(selectionEnd));
  };

  /** Drop a chord in at the caret, from the palette of the key's seven chords. */
  const insertChord = (chord: string) => {
    const at = caretRef.current ?? boxText.length;
    const token = `(${numbersMode ? chordToNumber(chord, chordKey) : chord})`;
    commitFromBox(boxText.slice(0, at) + token + boxText.slice(at));
    const next = at + token.length;
    caretRef.current = next;
    requestAnimationFrame(() => {
      lyricsRef.current?.focus();
      lyricsRef.current?.setSelectionRange(next, next);
    });
  };

  const importScriptureWith = async (vPer: number) => {
    if (!ref.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const { reference, verses } = await fetchScriptureBolls(ref, translation, {
        removeLineBreaks: !keepLineBreaks,
      });
      const labelled = `${reference} ${translation}`;
      const parts: string[] = [];
      for (let i = 0; i < verses.length; i += vPer) {
        if (i > 0) parts.push("---");
        const group = verses.slice(i, i + vPer);
        const verseTexts = group.map((v) => v.text.trim()).join(" ");
        parts.push(i === 0 ? `[${labelled}]\n${verseTexts}` : verseTexts);
      }
      const newBlock = parts.join("\n\n");
      // Append to any existing passage rather than replacing it.
      setManualText((prev) => (prev.trim() ? `${prev}\n\n---\n\n${newBlock}` : newBlock));
      // Title stays as the first passage imported.
      if (!manualText.trim()) updateSet(setId, { name: labelled });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const importScripture = () => importScriptureWith(versesPer);

  const importImages = async (files: FileList | null) => {
    if (!files) return;
    const list = Array.from(files).filter((f) => isUploadableImage(f.type));
    if (list.length === 0) return;
    // Sequential: each image is uploaded to R2 before its slide is added, and a
    // burst of parallel uploads gains little on files this small.
    for (const file of list) {
      const img = await prepareImageFile(file);
      if (img) addSlide(setId, { kind: "image", imageUrl: img.url, lines: [] });
    }
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
                className="mono uppercase w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <button
              type="submit"
              disabled={songSearching || !songQuery.trim()}
              className="pill flex h-10 w-10 items-center justify-center bg-foreground text-background transition hover:opacity-90 disabled:opacity-50"
              aria-label="Search"
            >
              {songSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </button>
          </form>
          {songErr && <p className="mt-2 text-xs text-destructive">{songErr}</p>}
          {songResults.length > 0 && (
            <div className="mt-2 max-h-56 space-y-1 overflow-auto rounded-2xl border border-foreground bg-background p-1">
              {songResults.map((s, idx) => {
                // Thin blue line at the boundary between local DB results and
                // online results (only when there are local results above).
                const showDivider =
                  s.source === "online" && songResults[idx - 1]?.source === "local";
                return (
                  <Fragment key={`${s.title}-${s.artist}-${idx}`}>
                    {showDivider && <div className="mx-2 my-1 h-px bg-[var(--brand-blue)]" />}
                    <button
                      onClick={() => {
                        // Bumping the sequence retires the online half of the
                        // search that is still in flight. Without it, results
                        // arriving after the click paint back over the song
                        // the user already picked.
                        searchSeq.current++;
                        setSongSearching(false);
                        setSongErr(null);
                        const imported = applyDividers(s.lyrics, linesPer);
                        setLyrics(imported);
                        setSongResults([]);
                        setPreview(null);
                        // Over half the local database carries chords. Switch
                        // them on with the key the source tagged, falling back
                        // to the first chord when there's no usable tag.
                        updateSet(setId, {
                          name: s.title,
                          ...(hasChords(imported)
                            ? {
                                chords: {
                                  key:
                                    (s.key ? normaliseKeyTag(s.key) : null) ??
                                    guessKey(imported) ??
                                    "G",
                                  display: "letters" as const,
                                },
                              }
                            : {}),
                        });
                      }}
                      onMouseEnter={(e) =>
                        setPreview({ text: songPreview(s.lyrics), x: e.clientX, y: e.clientY })
                      }
                      onMouseMove={(e) =>
                        setPreview((p) =>
                          p
                            ? { ...p, x: e.clientX, y: e.clientY }
                            : { text: songPreview(s.lyrics), x: e.clientX, y: e.clientY },
                        )
                      }
                      onMouseLeave={() => setPreview(null)}
                      className="group flex w-full items-center gap-2 rounded-xl p-2 text-left text-sm transition hover:bg-muted"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold">{s.title}</div>
                        <div className="mono uppercase truncate text-xs text-muted-foreground">
                          {s.artist}
                          {s.album ? ` · ${s.album}` : ""}
                        </div>
                      </div>
                      <Plus className="h-4 w-4 opacity-40 group-hover:opacity-100" />
                    </button>
                  </Fragment>
                );
              })}
            </div>
          )}

          {/* Lines per slide, sharing a row with the chords switch */}
          <ChordControls
            setId={setId}
            lyrics={lyrics}
            onLyricsChange={(next) => {
              pushHistory();
              setLyrics(next);
            }}
            onInsertChord={insertChord}
          >
            <span className="mono text-[10px] uppercase tracking-wider">Lines per slide</span>
            <input
              type="number"
              min={1}
              max={8}
              value={linesPer}
              onChange={(e) => {
                const next = Math.max(1, Number(e.target.value) || 1);
                if (lyrics.trim()) {
                  setPendingLinesPerConfirm(next);
                } else {
                  prevLinesPer.current = next;
                  setLinesPer(next);
                }
              }}
              className="pill h-7 w-16 border border-foreground bg-background px-3 text-xs outline-none"
            />
          </ChordControls>
        </div>

        {/* Lyrics textarea — fills remaining height */}
        <div className="min-h-0 flex-1 overflow-hidden">
          <Textarea
            ref={lyricsRef}
            value={boxText}
            onChange={(e) => commitFromBox(e.target.value)}
            onPaste={handleLyricsPaste}
            onSelect={(e) => (caretRef.current = e.currentTarget.selectionStart)}
            onKeyDown={(e) => {
              if (!e.metaKey && !e.ctrlKey) return;
              const k = e.key.toLowerCase();
              if (k === "z") {
                e.preventDefault();
                if (e.shiftKey) redoLyrics();
                else undoLyrics();
              } else if (k === "y") {
                e.preventDefault();
                redoLyrics();
              }
            }}
            placeholder={`Paste lyrics here, or select a song above.\nUse --- to split slides. Label sections with [Verse 1], [Chorus], etc.\nChord sheets paste in as-is — chords above the lyrics are picked up.`}
            className="mono h-full w-full resize-none rounded-none border-0 bg-transparent px-5 py-4 text-xs shadow-none focus-visible:ring-0"
          />
        </div>

        {/* Hover preview — chorus (or top of song) following the cursor. */}
        {preview &&
          preview.text &&
          (() => {
            const W = 240,
              H = 200,
              GAP = 16;
            const vw = window.innerWidth,
              vh = window.innerHeight;
            const left =
              preview.x + W + GAP > vw ? Math.max(8, preview.x - W - GAP) : preview.x + GAP;
            const top =
              preview.y + H + GAP > vh ? Math.max(8, preview.y - H - GAP) : preview.y + GAP;
            return (
              <div
                className="mono pointer-events-none fixed z-50 whitespace-pre-line rounded-2xl border border-foreground bg-background p-3 text-[11px] leading-relaxed shadow-lg"
                style={{
                  left,
                  top,
                  width: W,
                  maxHeight: H,
                  overflow: "hidden",
                }}
              >
                {preview.text}
              </div>
            );
          })()}

        <AlertDialog
          open={pendingLinesPerConfirm !== null}
          onOpenChange={(o) => {
            if (!o) {
              setPendingLinesPerConfirm(null);
              setLinesPer(prevLinesPer.current);
            }
          }}
        >
          <AlertDialogContent className="gap-0 rounded-3xl p-8">
            <AlertDialogTitle className="text-2xl font-normal leading-tight">
              Reset slide dividers?
            </AlertDialogTitle>
            <AlertDialogDescription className="mt-4 text-base text-foreground">
              This will reset your slide dividers. Your text edits will be kept.
            </AlertDialogDescription>
            <div className="mt-8 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  const next = pendingLinesPerConfirm!;
                  prevLinesPer.current = next;
                  setLinesPer(next);
                  setLyrics(applyDividers(lyrics, next));
                  setPendingLinesPerConfirm(null);
                }}
                className="mono uppercase flex-1 rounded-full bg-foreground py-2 text-sm text-background transition hover:opacity-90"
              >
                Continue
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingLinesPerConfirm(null);
                  setLinesPer(prevLinesPer.current);
                }}
                className="mono uppercase flex-1 rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
              >
                Cancel
              </button>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  if (kind === "scripture") {
    return (
      <div className="flex h-full flex-col gap-0 overflow-hidden">
        {/* API lookup section */}
        <div className="shrink-0 border-b border-foreground/20 p-4">
          <PillInput
            value={ref}
            onChange={setRef}
            placeholder="e.g. John 3, John 3:16-18, John 3:21-John 4:2"
            onEnter={() => {
              if (ref.trim() && !busy) importScripture();
            }}
          />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="mono mb-1 text-[10px] uppercase tracking-wider">Version</div>
              <div className="relative">
                <div
                  className="pill flex items-center gap-2 border border-foreground bg-background px-3 py-2 cursor-pointer"
                  onClick={() => setVersionOpen((o) => !o)}
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setVersionOpen(false);
                  }}
                  tabIndex={0}
                >
                  <span className="mono uppercase flex-1 truncate text-xs">{translation}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                </div>
                {versionOpen && (
                  <div className="catalogue-scroll absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-2xl border border-foreground bg-popover shadow-md">
                    {TRANSLATIONS.map((t) => (
                      <button
                        key={t.code}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setTranslation(t.code);
                          setVersionOpen(false);
                        }}
                        className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted ${t.code === translation ? "bg-muted" : ""}`}
                      >
                        <span className="mono uppercase text-xs shrink-0">{t.code}</span>
                        <span className="mono uppercase text-[10px] tracking-wider text-muted-foreground truncate text-right">
                          {t.label.replace(/^.+?—\s*/, "")}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <div className="mono mb-1 text-[10px] uppercase tracking-wider">Verses per slide</div>
              <input
                type="number"
                min={1}
                max={3}
                value={versesPer}
                onChange={(e) => {
                  const next = Math.min(3, Math.max(1, Number(e.target.value) || 1));
                  setVersesPer(next);
                }}
                className="pill h-9 w-full border border-foreground bg-background px-3 text-sm outline-none"
              />
            </div>
          </div>
          <label className="mt-3 inline-flex cursor-pointer items-center gap-2">
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
            className="mono uppercase pill mt-3 w-full bg-foreground py-2.5 text-sm text-background transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Fetching…" : "Import"}
          </button>
        </div>

        {/* Verses textarea — fills remaining height, live sync */}
        <div className="min-h-0 flex-1 overflow-hidden">
          <Textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder={
              "Paste verses here, or import above.\n\n[John 3:16-17]\nFor God so loved the world…\n---\nFor God did not send his Son…"
            }
            className="mono h-full w-full resize-none rounded-none border-0 bg-transparent px-5 py-4 text-xs shadow-none focus-visible:ring-0"
          />
        </div>
      </div>
    );
  }

  return <MediaImporter setId={setId} onImport={importImages} />;
}

/** Rasterise each page of a PDF to a JPEG blob.
 *
 *  Pages are scaled so the longest edge lands near IMAGE_MAX_DIM instead of the
 *  old fixed 2.0, and encoded at IMAGE_QUALITY instead of the browser default
 *  (0.92). A fixed 2.0 scale on a large page produced ~4000px JPEGs, which is
 *  how a single imported deck reached 7.7MB inside `sets.content`. */
async function pdfToImageBlobs(file: File): Promise<Blob[]> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const blobs: Blob[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const unscaled = page.getViewport({ scale: 1 });
      const longest = Math.max(unscaled.width, unscaled.height);
      const scale = Math.min(2.0, IMAGE_MAX_DIM / longest);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", IMAGE_QUALITY),
      );
      if (blob) blobs.push(blob);
    } catch {
      // skip failed pages silently
    }
  }

  return blobs;
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
    const imageFiles = Array.from(files).filter((f) => isUploadableImage(f.type));
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
          for (const blob of await pdfToImageBlobs(pdf)) {
            const img = await prepareRenderedImage(blob);
            if (img) addSlide(setId, { kind: "image", imageUrl: img.url, lines: [] });
          }
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

function AddToGathering({
  setId,
  onAdded,
}: {
  setId: string;
  onAdded?: (gatheringId: string) => void;
}) {
  const gatherings = useLibrary((s) => s.gatherings);
  const gatheringOrder = useLibrary((s) => s.gatheringOrder);
  const addSetToGathering = useLibrary((s) => s.addSetToGathering);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ids = q
      ? gatheringOrder.filter((pid) => gatherings[pid]?.name.toLowerCase().includes(q))
      : gatheringOrder;
    return ids.map((pid) => gatherings[pid]).filter(Boolean);
  }, [query, gatherings, gatheringOrder]);

  return (
    <div className="relative">
      <div className="pill flex items-center gap-2 border border-foreground bg-background px-4 py-2">
        <Search className="h-4 w-4" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setAdded(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={added ? `Added to ${added}` : "Add to a gathering…"}
          className="mono uppercase w-44 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
      </div>
      {open && matches.length > 0 && (
        <div className="absolute right-0 z-10 mt-1 max-h-60 w-72 overflow-auto rounded-2xl border border-foreground bg-popover shadow-md">
          {matches.map((p) => (
            <button
              key={p.id}
              onMouseDown={(e) => {
                e.preventDefault();
                addSetToGathering(p.id, setId);
                onAdded?.(p.id);
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
