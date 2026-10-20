import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PillSwitch } from "@/components/PillSwitch";
import { LangSearchList } from "@/components/LangSearch";
import { LANGS, langColor, langDef, type LangCode } from "@/lib/langs";
import type { SongLayout } from "@/lib/song-layout";

/** A setting row: the same height and label as the home Settings dialog. */
const ROW = "flex min-h-11 items-center justify-between gap-4";
const LABEL = "mono text-xs uppercase tracking-wider";
const WIDE_BUTTON =
  "mono uppercase mt-4 w-full rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background";

const LAYOUTS: { value: SongLayout; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "multilang", label: "Multilanguage" },
  { value: "response", label: "Call and Response" },
];

type Step = { kind: "settings" } | { kind: "current" } | { kind: "keep"; next: SongLayout };

/**
 * The song editor's Settings, opened from the pill beside the song search.
 * Laid out like Scripture Settings: the mode is one choice from a dropdown
 * (Standard, Multilanguage, Call and Response), and Chords is its own switch
 * below it, working with any mode.
 *
 * Two changes ask a question first:
 * - Into Multilanguage, a song that already has words asks what language
 *   they're in, so they land in the right column. An empty song skips it.
 * - Out of Multilanguage, a song with more than one language asks which one
 *   to keep. The others stay hidden and come back with Multilanguage.
 */
export function SongSettingsDialog({
  open,
  onOpenChange,
  layout,
  setLayout,
  askLang,
  songLangs,
  chords,
  setChords,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: SongLayout;
  /** `lang` answers the question the change asked: the song's current
   *  language (into Multilanguage) or the one to keep (out of it). */
  setLayout: (layout: SongLayout, lang?: LangCode) => void;
  /** The song has words, so Multilanguage asks for their language first. */
  askLang: boolean;
  /** A Multilanguage song's columns: leaving it asks which one to keep. */
  songLangs: LangCode[];
  chords: boolean;
  setChords: (on: boolean) => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "settings" });
  const back = () => setStep({ kind: "settings" });
  const close = (o: boolean) => {
    if (!o) back();
    onOpenChange(o);
  };
  const choose = (next: SongLayout) => {
    if (next === layout) return;
    if (next === "multilang" && askLang) setStep({ kind: "current" });
    else if (layout === "multilang" && songLangs.length > 1) setStep({ kind: "keep", next });
    else setLayout(next, layout === "multilang" ? songLangs[0] : undefined);
  };
  const current = LAYOUTS.find((l) => l.value === layout) ?? LAYOUTS[0];

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="gap-0 rounded-3xl p-8" aria-describedby={undefined}>
        {step.kind === "current" && (
          <>
            <DialogTitle className="text-2xl font-normal leading-tight">
              What language is this song currently in?
            </DialogTitle>
            <div className="mt-4">
              <LangSearchList
                options={LANGS}
                onPick={(code) => {
                  setLayout("multilang", code);
                  back();
                }}
              />
            </div>
            <button type="button" onClick={back} className={WIDE_BUTTON}>
              Cancel
            </button>
          </>
        )}

        {step.kind === "keep" && (
          <>
            <DialogTitle className="text-2xl font-normal leading-tight">
              Which language should this song keep?
            </DialogTitle>
            <p className="mt-4 text-base">
              The other languages aren&apos;t deleted. They stay hidden, and come back when you
              switch to Multilanguage again.
            </p>
            <div className="mt-4">
              {songLangs.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => {
                    setLayout(step.next, code);
                    back();
                  }}
                  className="flex min-h-10 w-full items-center gap-3 rounded-full px-3 text-left transition hover:bg-muted"
                >
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: langColor(code) }}
                  />
                  <span className="mono text-xs uppercase tracking-wider">
                    {langDef(code).label}
                  </span>
                </button>
              ))}
            </div>
            <button type="button" onClick={back} className={WIDE_BUTTON}>
              Cancel
            </button>
          </>
        )}

        {step.kind === "settings" && (
          <>
            <DialogTitle className="text-2xl font-normal leading-tight">Song Settings</DialogTitle>
            <div className="mt-4">
              <div className={ROW}>
                <div className={LABEL}>Mode</div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="pill mono flex h-8 items-center gap-1.5 border border-foreground bg-background pl-4 pr-3 text-xs uppercase tracking-wider transition hover:bg-muted"
                    >
                      {current.label}
                      <ChevronDown className="h-3 w-3 shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[12rem]">
                    {LAYOUTS.map((l) => (
                      <DropdownMenuItem
                        key={l.value}
                        onClick={() => choose(l.value)}
                        className={`mono text-xs uppercase tracking-wider focus:bg-[var(--brand-blue)] focus:text-[var(--brand-white)] ${
                          l.value === layout ? "font-bold" : ""
                        }`}
                      >
                        {l.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className={ROW}>
                <div className={LABEL}>Chords</div>
                <PillSwitch label="Chords" checked={chords} onCheckedChange={setChords} />
              </div>
            </div>
            <button type="button" onClick={() => close(false)} className={WIDE_BUTTON}>
              Done
            </button>
            <p className="mono mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">
              These settings apply to this song only.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
