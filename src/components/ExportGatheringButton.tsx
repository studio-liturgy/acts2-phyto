import { useEffect, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BackgroundControls } from "@/components/BackgroundEditor";
import { useSmoothProgress } from "@/hooks/use-smooth-progress";
import { SlideView } from "@/components/SlideView";
import {
  gatheringSectionsReady,
  loadGatheringSections,
  useGatheringSections,
  useLibrary,
} from "@/lib/store";
import { gatheringExportSlides, type ExportFormat, type ExportSlide } from "@/lib/gathering-export";

const LABEL = "mono mb-2 text-[10px] uppercase tracking-wider text-muted-foreground";

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: "pdf", label: "PDF" },
  { value: "pptx", label: "PPTX" },
];

/** The gathering's slides in play order, as the export draws them. */
async function exportSlidesFor(gatheringId: string): Promise<ExportSlide[]> {
  if (!gatheringSectionsReady(useGatheringSections.getState(), gatheringId)) {
    await loadGatheringSections(gatheringId);
  }
  const lib = useLibrary.getState();
  const gathering = lib.gatherings[gatheringId];
  if (!gathering) throw new Error("Gathering not found");
  const sections = useGatheringSections.getState();
  return gatheringExportSlides(gathering, {
    sets: lib.sets,
    songTemplate: lib.songTemplate,
    scriptureTemplate: lib.scriptureTemplate,
    arrangementsOn: lib.workspaceSettings.arrangements,
    arranged: sections.arranged[gatheringId] ?? {},
    hidden: sections.hidden[gatheringId] ?? {},
  });
}

/**
 * Export a whole gathering as one PDF or PowerPoint file: every set in run
 * order, each slide drawn as the output screen shows it. The button sits
 * beside the gathering's other header buttons (home card, presenter header)
 * and opens a dialog: the slides on the left, the Background controls (the same
 * setting as the presenter's card), format and Export on the right.
 */
export function ExportGatheringButton({
  gatheringId,
  className = "",
}: {
  gatheringId: string;
  /** Border/hover styling of the neighbouring buttons. */
  className?: string;
}) {
  const hasSets = useLibrary((s) => (s.gatherings[gatheringId]?.setIds.length ?? 0) > 0);
  const gatheringName = useLibrary((s) => s.gatherings[gatheringId]?.name ?? "gathering");
  const [open, setOpen] = useState(false);
  const [slides, setSlides] = useState<ExportSlide[] | null>(null);
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [finished, setFinished] = useState(false);
  const busy = progress !== null;

  // The slides are read when the dialog opens, so they match what's there now.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSlides(null);
    exportSlidesFor(gatheringId)
      .then((s) => {
        if (!cancelled) setSlides(s);
      })
      .catch((err) => {
        console.error("Gathering export: reading the slides failed", err);
        if (!cancelled) setSlides([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, gatheringId]);

  const run = async () => {
    if (busy || !slides || slides.length === 0) return;
    setProgress({ done: 0, total: slides.length });
    try {
      const name = useLibrary.getState().gatherings[gatheringId]?.name ?? "Gathering";
      const { exportGatheringFile } = await import("@/lib/gathering-export-render");
      await exportGatheringFile(name, slides, format, (done, total) =>
        setProgress({ done, total }),
      );
      // Not an abrupt close: the full circle reads Done for a moment, then the
      // dialog fades out, and only then does the circle reset.
      setFinished(true);
      await new Promise((r) => setTimeout(r, 900));
      setOpen(false);
      await new Promise((r) => setTimeout(r, 250));
    } catch (err) {
      console.error("Gathering export failed", err);
      setFailed(true);
    } finally {
      setFinished(false);
      setProgress(null);
    }
  };

  // The pie sweeps smoothly between slides rather than a step at a time.
  const smooth = useSmoothProgress(progress?.done ?? 0, progress?.total ?? 0, busy);
  const sweep = finished ? 1 : smooth;
  // Every slide drawn, the file still being packed: the circle breathes (a
  // very slight grow and shrink) so it reads as still working.
  const packing =
    busy && !finished && !!progress && progress.total > 0 && progress.done >= progress.total;

  if (!hasSets) return null;

  const exportLabel = busy
    ? `Exporting slide ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`
    : "Export";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`pill flex h-10 w-10 items-center justify-center transition hover:bg-foreground hover:text-background ${className}`}
        title="Export gathering"
        aria-label="Export gathering"
      >
        <Upload className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent
          className="flex max-w-5xl flex-col gap-0 overflow-hidden rounded-3xl p-0"
          aria-describedby={undefined}
        >
          {/* Laid out like the set editor: a header bar, then columns split by
              full-height lines. */}
          <header className="shrink-0 border-b border-foreground py-4 pl-6 pr-14">
            <DialogTitle className="truncate text-2xl font-normal leading-tight">
              Export {gatheringName}
            </DialogTitle>
          </header>
          <div className={`flex h-[60vh] min-h-0 divide-x divide-foreground`}>
            {/* Left: every slide in play order, as the file will show it. */}
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              {slides === null ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : slides.length === 0 ? (
                <p className="mono uppercase py-16 text-center text-xs tracking-wider text-muted-foreground">
                  No slides to export
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {/* Framed like the set editor's slide grid. */}
                  {slides.map((item, i) => (
                    <div
                      key={`${i}-${item.slide.id}`}
                      className="relative overflow-hidden rounded-md"
                    >
                      <SlideView
                        slide={item.slide}
                        versions={item.versions}
                        template={item.template}
                        variant="thumb"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: background, format, and Export under them. While
                exporting nothing here responds, hover included (the slides
                still scroll). */}
            <div
              className={`flex w-80 shrink-0 flex-col overflow-y-auto p-6 ${busy ? "pointer-events-none" : ""}`}
            >
              <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
                <BackgroundControls />
                <div>
                  <div className={LABEL}>Format</div>
                  <div className="grid grid-cols-2 gap-2">
                    {FORMATS.map((f) => (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => setFormat(f.value)}
                        className={`mono rounded-lg border px-3 py-2 text-[10px] uppercase transition ${
                          format === f.value
                            ? "border-foreground bg-foreground text-background"
                            : "border-foreground/20 hover:border-foreground"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </fieldset>
              <button
                type="button"
                onClick={run}
                disabled={busy || !slides || slides.length === 0}
                aria-label={exportLabel}
                className={`mono relative mt-6 flex aspect-square w-full items-center justify-center rounded-full border border-foreground text-sm uppercase tracking-wider transition-colors disabled:cursor-default ${packing ? "animate-breathe" : ""} ${
                  busy
                    ? ""
                    : "hover:bg-foreground hover:text-background disabled:opacity-60 disabled:hover:bg-transparent disabled:hover:text-foreground"
                }`}
              >
                {/* Exporting: the circle fills clockwise from 12 o'clock like a
                    clock hand, slides done of total in the middle. */}
                {busy && (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: `conic-gradient(var(--foreground) ${sweep * 360}deg, transparent 0deg)`,
                    }}
                  />
                )}
                {/* Difference blending keeps the count readable over both the
                    filled and the empty part, in either theme. */}
                <span
                  className={`relative tabular-nums ${busy ? "text-white mix-blend-difference" : ""}`}
                >
                  {!busy ? (
                    "Export"
                  ) : finished ? (
                    "Done"
                  ) : progress.total > 0 && progress.done >= progress.total ? (
                    <AlmostDone />
                  ) : (
                    `${progress.done}/${progress.total}`
                  )}
                </span>
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={failed} onOpenChange={setFailed}>
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          <AlertDialogTitle className="text-2xl font-normal leading-tight">
            Export failed
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            Something went wrong while making the file. Please try again.
          </AlertDialogDescription>
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => setFailed(false)}
              className="mono uppercase flex-1 rounded-full bg-foreground py-2 text-sm text-background transition hover:opacity-90"
            >
              OK
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** "Almost done" with its three dots coming in one after another, on a loop.
 *  The dots keep their space, so the words don't shift. */
function AlmostDone() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((v) => (v + 1) % 4), 400);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      Almost done
      {[1, 2, 3].map((i) => (
        <span key={i} className={n >= i ? "opacity-100" : "opacity-0"}>
          .
        </span>
      ))}
    </>
  );
}
