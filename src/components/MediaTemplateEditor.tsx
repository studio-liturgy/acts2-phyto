import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { NumberStepper } from "@/components/NumberStepper";
import { useLibrary } from "@/lib/store";
import { PillSwitch } from "@/components/PillSwitch";
import type { Set as PhytoSet } from "@/lib/types";

/**
 * The per-set media playback controls: auto-advance delay and loop. Edits the
 * set directly (these live on the set, not a shared template). Shared by the
 * presenter and the media set editor.
 */
export function MediaPlaybackControls({ setId }: { setId: string }) {
  const phytoSet = useLibrary((s) => s.sets[setId]);
  const updateSet = useLibrary((s) => s.updateSet);
  const [autoplayNotice, setAutoplayNotice] = useState(false);
  if (!phytoSet) return null;
  const auto = phytoSet.autoAdvanceMs ?? 0;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="mono text-[10px] uppercase tracking-wider">Auto advance</span>
        <div className="flex items-center gap-1">
          <NumberStepper
            value={auto / 1000}
            onChange={(seconds) => {
              // Sequence is OFF, then 2s, 3s, 4s… in whole-second steps. Turning
              // it on from OFF starts at 2s; stepping below 2s turns it back OFF.
              let next: number;
              if (seconds <= 0) next = 0;
              else if (auto === 0) next = 2;
              else if (seconds < 2) next = 0;
              else next = Math.round(seconds);
              const ms = next * 1000;
              const patch: Partial<PhytoSet> = { autoAdvanceMs: ms };
              // Auto advance relies on videos playing on their own, so turning it
              // on flips every video slide to autoplay. Tell the operator.
              if (ms > 0 && phytoSet.slides.some((s) => s.kind === "video" && !s.autoplay)) {
                patch.slides = phytoSet.slides.map((s) =>
                  s.kind === "video" ? { ...s, autoplay: true } : s,
                );
                setAutoplayNotice(true);
              }
              updateSet(setId, patch);
            }}
            min={0}
            step={1}
            // Zero is "no auto advance" rather than a zero-second wait, so it
            // reads as OFF instead of a number the operator might trust.
            format={(n) => (n === 0 ? "OFF" : String(n))}
            boxClassName="w-10"
            decrementLabel="Shorter auto advance"
            incrementLabel="Longer auto advance"
          />
          <span className="text-xs text-muted-foreground">s</span>
        </div>
      </div>
      {/* Loop only makes sense alongside auto advance (it restarts the set once
          it reaches the end), so it's only offered when auto advance is on. */}
      {auto > 0 && (
        <div className="flex items-center justify-between gap-2">
          <span className="mono text-[10px] uppercase tracking-wider">Loop</span>
          <PillSwitch
            label="Loop"
            checked={!!phytoSet.loop}
            onCheckedChange={(on) => updateSet(setId, { loop: on })}
          />
        </div>
      )}
      <Dialog open={autoplayNotice} onOpenChange={setAutoplayNotice}>
        <DialogContent className="gap-0 rounded-3xl p-8" aria-describedby={undefined}>
          <DialogTitle className="text-2xl font-normal leading-tight">
            Videos set to autoplay
          </DialogTitle>

          <p className="mt-4 text-base">
            Auto advance needs videos to start on their own, so every video slide in this set is now
            set to autoplay. They'll play, then the set advances after the delay you set.
          </p>

          <div className="mt-8">
            <button
              type="button"
              onClick={() => setAutoplayNotice(false)}
              className="mono uppercase w-full rounded-full bg-foreground py-2 text-sm text-background transition hover:opacity-90"
            >
              Got it
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * The "Edit Media Functions" toggle, mirroring SongTemplateEditor /
 * ScriptureTemplateEditor: a full-width button that opens a panel with the
 * playback controls. Used in both the presenter and the media set editor.
 */
export function MediaTemplateEditor({ setId }: { setId: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mono uppercase pill flex w-full items-center justify-center border border-foreground px-4 py-1.5 text-xs tracking-wider transition hover:bg-foreground hover:text-background"
      >
        Edit Media Functions
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-foreground p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="mono text-[10px] uppercase tracking-wider">Media Functions</div>
        <button
          onClick={() => setOpen(false)}
          className="mono text-[10px] uppercase text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
      <MediaPlaybackControls setId={setId} />
      <button
        onClick={() => setOpen(false)}
        className="pill mono uppercase mt-3 flex w-full items-center justify-center border border-foreground bg-foreground px-4 py-1.5 text-xs tracking-wider text-background transition hover:opacity-90"
      >
        Apply to this media set
      </button>
    </div>
  );
}
