import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { LangSearchList } from "@/components/LangSearch";
import { LANGS, langColor, langDef, type LangCode } from "@/lib/langs";
import type { SongLayout } from "@/lib/song-layout";

const WIDE_BUTTON =
  "mono uppercase mt-4 w-full rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background";

/** The question a mode change asks before it happens (see SongModePicker). */
export type ModeQuestion =
  | { kind: "current" }
  | { kind: "keep"; next: SongLayout; langs: LangCode[] };

/**
 * - Into Multilanguage, a song that already has words asks what language
 *   they're in, so they land in the right column.
 * - Out of Multilanguage, a song with more than one language asks which one
 *   to keep. The others stay hidden and come back with Multilanguage.
 */
export function SongModeDialog({
  question,
  onAnswer,
  onCancel,
}: {
  question: ModeQuestion | null;
  onAnswer: (next: SongLayout, lang: LangCode) => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={!!question} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="gap-0 rounded-3xl p-8" aria-describedby={undefined}>
        {question?.kind === "current" && (
          <>
            <DialogTitle className="text-2xl font-normal leading-tight">
              What language is this song currently in?
            </DialogTitle>
            <div className="mt-4">
              <LangSearchList options={LANGS} onPick={(code) => onAnswer("multilang", code)} />
            </div>
          </>
        )}
        {question?.kind === "keep" && (
          <>
            <DialogTitle className="text-2xl font-normal leading-tight">
              Which language should this song keep?
            </DialogTitle>
            <p className="mt-4 text-base">
              The other languages aren&apos;t deleted. They stay hidden, and come back when you
              switch to Multi-Language again.
            </p>
            <div className="mt-4">
              {question.langs.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => onAnswer(question.next, code)}
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
          </>
        )}
        <button type="button" onClick={onCancel} className={WIDE_BUTTON}>
          Cancel
        </button>
      </DialogContent>
    </Dialog>
  );
}
