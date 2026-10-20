import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { PillSwitch } from "@/components/PillSwitch";
import { LANGS, langColor, type LangCode } from "@/lib/langs";
import type { SongLayout } from "@/lib/song-layout";

/** A setting row: the same height and label as the home Settings dialog. */
const ROW = "flex min-h-11 items-center justify-between gap-4";
const LABEL = "mono text-xs uppercase tracking-wider";

const LAYOUTS: { value: SongLayout; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "multilang", label: "Multilanguage" },
  { value: "response", label: "Call and Response" },
];

/**
 * The song editor's Settings, opened from the pill beside the song search.
 * Laid out like Scripture Settings. The three layouts are one choice (turning
 * one on turns the others off; turning the current one off goes back to
 * Standard). Chords is its own switch below them and works with any layout.
 *
 * Turning Multilanguage on for a song that already has words first asks what
 * language they're in, so they land in the right column. An empty song skips
 * the question and picks its first language in the editor.
 */
export function SongSettingsDialog({
  open,
  onOpenChange,
  layout,
  setLayout,
  askLang,
  chords,
  setChords,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: SongLayout;
  /** `lang` is the answer to "What language is this song currently in?" (Multilanguage
   *  on a song with words). */
  setLayout: (layout: SongLayout, lang?: LangCode) => void;
  /** The song has words, so Multilanguage asks for their language first. */
  askLang: boolean;
  chords: boolean;
  setChords: (on: boolean) => void;
}) {
  const [asking, setAsking] = useState(false);
  const close = (o: boolean) => {
    if (!o) setAsking(false);
    onOpenChange(o);
  };
  if (asking) {
    return (
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="gap-0 rounded-3xl p-8" aria-describedby={undefined}>
          <DialogTitle className="text-2xl font-normal leading-tight">
            What language is this song currently in?
          </DialogTitle>
          <div className="mt-4 max-h-80 overflow-y-auto">
            {LANGS.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => {
                  setLayout("multilang", l.code);
                  setAsking(false);
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-full px-3 text-left transition hover:bg-muted"
              >
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: langColor(l.code) }}
                />
                <span className="mono text-xs uppercase tracking-wider">{l.label}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setAsking(false)}
            className="mono uppercase mt-4 w-full rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
          >
            Cancel
          </button>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="gap-0 rounded-3xl p-8" aria-describedby={undefined}>
        <DialogTitle className="text-2xl font-normal leading-tight">Song Settings</DialogTitle>
        <div className="mt-4">
          {LAYOUTS.map((l) => (
            <div key={l.value} className={ROW}>
              <div className={LABEL}>{l.label}</div>
              <PillSwitch
                label={l.label}
                checked={layout === l.value}
                onCheckedChange={(on) => {
                  if (on && l.value === "multilang" && askLang) setAsking(true);
                  else if (on) setLayout(l.value);
                  else if (l.value !== "standard") setLayout("standard");
                }}
              />
            </div>
          ))}
          <div className="my-2 border-t border-foreground/15" />
          <div className={ROW}>
            <div className={LABEL}>Chords</div>
            <PillSwitch label="Chords" checked={chords} onCheckedChange={setChords} />
          </div>
        </div>
        <button
          type="button"
          onClick={() => close(false)}
          className="mono uppercase mt-4 w-full rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
        >
          Done
        </button>
        <p className="mono mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">
          These settings apply to this song only.
        </p>
      </DialogContent>
    </Dialog>
  );
}
