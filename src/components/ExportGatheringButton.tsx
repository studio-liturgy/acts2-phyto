import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  gatheringSectionsReady,
  loadGatheringSections,
  useGatheringSections,
  useLibrary,
} from "@/lib/store";
import { gatheringExportSlides, type ExportFormat } from "@/lib/gathering-export";

/**
 * Export a whole gathering as one PDF or PowerPoint file: every set in run
 * order, each slide drawn as the output screen shows it. Sits beside the
 * gathering's other header buttons (home card, presenter header).
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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const busy = progress !== null;

  const run = async (format: ExportFormat) => {
    if (busy) return;
    setProgress({ done: 0, total: 0 });
    try {
      if (!gatheringSectionsReady(useGatheringSections.getState(), gatheringId)) {
        await loadGatheringSections(gatheringId);
      }
      const lib = useLibrary.getState();
      const gathering = lib.gatherings[gatheringId];
      if (!gathering) throw new Error("Gathering not found");
      const sections = useGatheringSections.getState();
      const slides = gatheringExportSlides(gathering, {
        sets: lib.sets,
        songTemplate: lib.songTemplate,
        scriptureTemplate: lib.scriptureTemplate,
        arrangementsOn: lib.workspaceSettings.arrangements,
        arranged: sections.arranged[gatheringId] ?? {},
        hidden: sections.hidden[gatheringId] ?? {},
      });
      if (slides.length === 0) throw new Error("No slides");
      setProgress({ done: 0, total: slides.length });
      const { exportGatheringFile } = await import("@/lib/gathering-export-render");
      await exportGatheringFile(gathering.name, slides, format, (done, total) =>
        setProgress({ done, total }),
      );
    } catch (err) {
      console.error("Gathering export failed", err);
      setFailed(true);
    } finally {
      setProgress(null);
    }
  };

  if (!hasSets) return null;

  const label = busy
    ? progress.total > 0
      ? `Exporting slide ${progress.done} of ${progress.total}`
      : "Exporting"
    : "Export gathering";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={busy}>
          <button
            type="button"
            className={`pill flex h-10 w-10 items-center justify-center transition hover:bg-foreground hover:text-background disabled:cursor-wait disabled:hover:bg-transparent disabled:hover:text-foreground ${className}`}
            title={label}
            aria-label={label}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => run("pdf")}
            className="mono uppercase text-xs tracking-wider"
          >
            PDF
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => run("pptx")}
            className="mono uppercase text-xs tracking-wider"
          >
            PowerPoint
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
