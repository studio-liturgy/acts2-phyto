import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { PillSwitch } from "@/components/PillSwitch";
import { NumberStepper } from "@/components/NumberStepper";

/** A setting row: the same height and label as the home Settings dialog. */
const ROW = "flex min-h-11 items-center justify-between gap-4";
const LABEL = "mono text-xs uppercase tracking-wider";

/**
 * The scripture and message editors' import settings, opened from the
 * Settings pill beside the reference box. Laid out like the home Settings
 * dialog: one row per setting, label left, control right, then Done.
 * Two stacked versions halve the room on a slide, so verses per slide tops
 * out at 2 then.
 */
export function ScriptureSettingsDialog({
  open,
  onOpenChange,
  twoVersions,
  setTwoVersions,
  busy,
  versesPer,
  setVersesPer,
  maxVerses,
  keepLineBreaks,
  setKeepLineBreaks,
  versionRefs,
  setVersionRefs,
  refPerSlide,
  setRefPerSlide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The set carries a 2nd bible version (a picker beside the 1st). */
  twoVersions: boolean;
  setTwoVersions: (on: boolean) => void;
  /** A fetch is running: the switches that fetch wait for it. */
  busy: boolean;
  versesPer: number;
  setVersesPer: (n: number) => void;
  maxVerses: number;
  keepLineBreaks: boolean;
  setKeepLineBreaks: (on: boolean) => void;
  /** References carry their version code; toggling relabels existing ones. */
  versionRefs: boolean;
  setVersionRefs: (on: boolean) => void;
  /** Each verse slide shows its own verses ("John 1:1-2"). */
  refPerSlide: boolean;
  setRefPerSlide: (on: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-3xl p-8" aria-describedby={undefined}>
        <DialogTitle className="text-2xl font-normal leading-tight">Settings</DialogTitle>
        <div className="mt-4">
          <div className={ROW}>
            <div className={LABEL}>Two versions</div>
            <PillSwitch
              label="Two versions"
              checked={twoVersions}
              disabled={busy}
              onCheckedChange={setTwoVersions}
            />
          </div>
          <div className={ROW}>
            <div className={LABEL}>Verses per slide</div>
            <NumberStepper
              value={Math.min(versesPer, maxVerses)}
              onChange={(n) => setVersesPer(Math.min(maxVerses, Math.max(1, Math.round(n))))}
              min={1}
              max={maxVerses}
              decrementLabel="Fewer verses per slide"
              incrementLabel="More verses per slide"
            />
          </div>
          <div className={ROW}>
            <div className={LABEL}>Line breaks</div>
            <PillSwitch
              label="Line breaks"
              checked={keepLineBreaks}
              onCheckedChange={setKeepLineBreaks}
            />
          </div>
          <div className={ROW}>
            <div className={LABEL}>Hide version reference</div>
            <PillSwitch
              label="Hide version reference"
              checked={!versionRefs}
              onCheckedChange={(hide) => setVersionRefs(!hide)}
            />
          </div>
          <div className={ROW}>
            <div className={LABEL}>Reference per slide</div>
            <PillSwitch
              label="Reference per slide"
              checked={refPerSlide}
              disabled={busy}
              onCheckedChange={setRefPerSlide}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="mono uppercase mt-4 w-full rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
        >
          Done
        </button>
      </DialogContent>
    </Dialog>
  );
}
