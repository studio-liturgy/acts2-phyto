import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BackgroundControls } from "@/components/BackgroundEditor";
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
  { value: "pptx", label: "PowerPoint" },
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
 * and opens a dialog: the slides on the left, the Background controls (the
 * same setting as the presenter's card) and the format on the right.
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
  const [open, setOpen] = useState(false);
  const [slides, setSlides] = useState<ExportSlide[] | null>(null);
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState(false);
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
      setOpen(false);
    } catch (err) {
      console.error("Gathering export failed", err);
      setFailed(true);
    } finally {
      setProgress(null);
    }
  };

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
        <Download className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent
          className="flex max-w-5xl flex-col gap-0 rounded-3xl p-8"
          aria-describedby={undefined}
        >
          <DialogTitle className="text-2xl font-normal leading-tight">Export gathering</DialogTitle>
          <div className="mt-6 flex h-[60vh] min-h-0 gap-6">
            {/* Left: every slide in play order, as the file will show it. */}
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {slides === null ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : slides.length === 0 ? (
                <p className="mono uppercase py-16 text-center text-xs tracking-wider text-muted-foreground">
                  No slides to export
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {slides.map((item, i) => (
                    <SlideView
                      key={`${i}-${item.slide.id}`}
                      slide={item.slide}
                      versions={item.versions}
                      template={item.template}
                      variant="thumb"
                      className="rounded-lg border border-foreground/10"
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Right: the background, the format, and Export at the bottom. */}
            <div className="flex w-72 shrink-0 flex-col">
              <fieldset
                disabled={busy}
                className="min-h-0 space-y-4 overflow-y-auto disabled:opacity-60"
              >
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
                className="mono uppercase mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-foreground py-2 text-sm text-background transition hover:opacity-90 disabled:cursor-default disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {exportLabel}
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
