import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLibrary, useSongTemplateDraft, useScriptureTemplateDraft } from "@/lib/store";
import { SongTemplateEditor } from "@/components/SongTemplateEditor";
import { ScriptureTemplateEditor } from "@/components/ScriptureTemplateEditor";
import { parseLyrics, fileToCompressedImageDataUrl, scriptureToSlides, parseYouTubeId } from "@/lib/parsers";
import { supabase } from "@/lib/supabase";
import { MEDIA_MAX_BYTES, isUploadableVideo } from "@/lib/media";
import { fetchScriptureBolls, TRANSLATIONS } from "@/lib/bible";
import { searchSongs, preloadSongs, parseQuery, songPreview, type SongResult } from "@/lib/songs";
import { SlideView } from "@/components/SlideView";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUpLeft, ArrowUpRight, Plus, Trash2, GripVertical, Search, Loader2, Pencil, ChevronDown } from "lucide-react";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription } from "@/components/ui/alert-dialog";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
    meta: [
      { title: `Set Editor | ${APP_NAME}` },
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
  const [showDeleteSetDialog, setShowDeleteSetDialog] = useState(false);
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
            onChange={(e) => updateSet(phytoSet.id, { name: e.target.value })}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
            className="h-9 w-56 border-foreground text-base shadow-none focus-visible:ring-0"
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

        <span
          className={`pill mono shrink-0 px-2.5 py-0.5 text-[10px] uppercase tracking-wider ${kindBadgeBg(phytoSet.kind)}`}
        >
          {phytoSet.kind}
        </span>
      </div>

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
          <AlertDialogTitle className="text-2xl font-normal leading-tight">Delete this set?</AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            This cannot be undone.
          </AlertDialogDescription>
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => { deleteSet(phytoSet.id); navigate({ to: redirectTo ?? "/" }); }}
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
  const scriptureTemplate = useLibrary((s) => s.scriptureTemplate);
  const scriptureDraft = useScriptureTemplateDraft((s) => s.draft);
  const effectiveScriptureTemplate = scriptureDraft ?? scriptureTemplate;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [multiSel, setMultiSel] = useState<Set<string>>(new Set());
  const [groupView, setGroupView] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [showFileSizeDialog, setShowFileSizeDialog] = useState(false);
  const [fileOver, setFileOver] = useState(false);
  const [converting, setConverting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [videoLink, setVideoLink] = useState("");
  const [videoErr, setVideoErr] = useState<string | null>(null);


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
          {/* Right: template editor + live slide grid */}
          <div className="w-1/2 overflow-y-auto p-6">
            <div className="mb-4">
              <ScriptureTemplateEditor />
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
                              <SlideView slide={s} variant="thumb" template={effectiveScriptureTemplate} />
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

  // Media: merged import + slides panel
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
      const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !json.ok || !json.url) {
        setVideoErr(json.error ?? "Upload failed.");
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
    if (nonVideo.some((f) => f.size > MAX_FILE_SIZE) || videoFiles.some((f) => f.size > MEDIA_MAX_BYTES)) {
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

    const imageFiles = nonVideo.filter((f) =>
      /^image\/(png|jpe?g|webp|gif|bmp)$/i.test(f.type)
    );
    const pdfFiles = nonVideo.filter((f) => f.type === "application/pdf");

    if (imageFiles.length > 0) {
      const urls = await Promise.all(
        imageFiles.map((f) => fileToCompressedImageDataUrl(f).catch(() => null))
      );
      urls.forEach((url) => {
        if (url) addSlide(phytoSet.id, { kind: "image", imageUrl: url, lines: [] });
      });
    }

    if (pdfFiles.length > 0) {
      setConverting(true);
      for (const pdf of pdfFiles) {
        try {
          const urls = await pdfToImageUrls(pdf);
          urls.forEach((url) =>
            addSlide(phytoSet.id, { kind: "image", imageUrl: url, lines: [] })
          );
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
                  <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
                ) : converting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Converting…</>
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
          <AlertDialogTitle className="text-2xl font-normal leading-tight">File too large</AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            One or more files exceeds the limit (5 MB for images and PDFs, 100 MB for videos). Please resize or compress your files and try again.
          </AlertDialogDescription>
          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setShowFileSizeDialog(false)}
              className="pill border border-foreground bg-background px-5 py-2 text-sm transition hover:bg-foreground hover:text-background"
            >
              OK
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
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
      onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
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
    if (countInGroup > 0 && countInGroup % linesPer === 0) {
      out.push("---");
    }
    out.push(line);
    countInGroup++;
  }

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
        lines: content.split("\n").map((l) => l.trim()).filter(Boolean),
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
  const [preview, setPreview] = useState<{ text: string; x: number; y: number } | null>(null);
  const searchSeq = useRef(0);

  const [pendingLinesPerConfirm, setPendingLinesPerConfirm] = useState<number | null>(null);
  const [versionOpen, setVersionOpen] = useState(false);

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

  // Warm the local song database so the first search paints instantly.
  useEffect(() => {
    if (kind === "song") preloadSongs();
  }, [kind]);

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
  const handleLyricsChange = (val: string) => {
    const wasEmpty = !lyrics.trim();
    setLyrics(val);
    if (wasEmpty && val.trim() && songQuery.trim()) {
      const current = useLibrary.getState().sets[setId];
      if (current && (current.name.trim() === "New Song" || !current.name.trim())) {
        const titled = parseQuery(songQuery).title.replace(/\b\w/g, (c) => c.toUpperCase());
        if (titled) updateSet(setId, { name: titled });
      }
    }
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
                className="mono uppercase w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
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
              {songResults.map((s, idx) => {
                // Thin blue line at the boundary between local DB results and
                // online results (only when there are local results above).
                const showDivider =
                  s.source === "online" &&
                  songResults[idx - 1]?.source === "local";
                return (
                  <Fragment key={`${s.title}-${s.artist}-${idx}`}>
                    {showDivider && (
                      <div className="mx-2 my-1 h-px bg-[var(--brand-blue)]" />
                    )}
                    <button
                      onClick={() => {
                        setLyrics(applyDividers(s.lyrics, linesPer));
                        setSongResults([]);
                        setPreview(null);
                        updateSet(setId, { name: s.title });
                      }}
                      onMouseEnter={(e) =>
                        setPreview({ text: songPreview(s.lyrics), x: e.clientX, y: e.clientY })
                      }
                      onMouseMove={(e) =>
                        setPreview((p) =>
                          p
                            ? { ...p, x: e.clientX, y: e.clientY }
                            : { text: songPreview(s.lyrics), x: e.clientX, y: e.clientY }
                        )
                      }
                      onMouseLeave={() => setPreview(null)}
                      className="group flex w-full items-center gap-2 rounded-xl p-2 text-left text-sm transition hover:bg-muted"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold">{s.title}</div>
                        <div className="mono uppercase truncate text-xs text-muted-foreground">
                          {s.artist}{s.album ? ` · ${s.album}` : ""}
                        </div>
                      </div>
                      <Plus className="h-4 w-4 opacity-40 group-hover:opacity-100" />
                    </button>
                  </Fragment>
                );
              })}
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
                  setPendingLinesPerConfirm(next);
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
            onChange={(e) => handleLyricsChange(e.target.value)}
            placeholder={`Paste lyrics here, or select a song above.\nUse --- to split slides. Label sections with [Verse 1], [Chorus], etc.`}
            className="mono h-full w-full resize-none rounded-none border-0 bg-transparent px-5 py-4 text-xs shadow-none focus-visible:ring-0"
          />
        </div>

        {/* Hover preview — chorus (or top of song) following the cursor. */}
        {preview && preview.text && (() => {
          const W = 240, H = 200, GAP = 16;
          const vw = window.innerWidth, vh = window.innerHeight;
          const left = preview.x + W + GAP > vw ? Math.max(8, preview.x - W - GAP) : preview.x + GAP;
          const top = preview.y + H + GAP > vh ? Math.max(8, preview.y - H - GAP) : preview.y + GAP;
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

        <AlertDialog open={pendingLinesPerConfirm !== null} onOpenChange={(o) => { if (!o) { setPendingLinesPerConfirm(null); setLinesPer(prevLinesPer.current); } }}>
          <AlertDialogContent className="gap-0 rounded-3xl p-8">
            <AlertDialogTitle className="text-2xl font-normal leading-tight">Reset slide dividers?</AlertDialogTitle>
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
                onClick={() => { setPendingLinesPerConfirm(null); setLinesPer(prevLinesPer.current); }}
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
          <PillInput value={ref} onChange={setRef} placeholder="e.g. John 3, John 3:16-18, John 3:21-John 4:2" onEnter={() => { if (ref.trim() && !busy) importScripture(); }} />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="mono mb-1 text-[10px] uppercase tracking-wider">Version</div>
              <div className="relative">
                <div className="pill flex items-center gap-2 border border-foreground bg-background px-3 py-2 cursor-pointer"
                  onClick={() => setVersionOpen((o) => !o)}
                  onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setVersionOpen(false); }}
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
                        <span className="mono uppercase text-[10px] tracking-wider text-muted-foreground truncate text-right">{t.label.replace(/^.+?—\s*/, "")}</span>
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
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setAdded(null); }}
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
