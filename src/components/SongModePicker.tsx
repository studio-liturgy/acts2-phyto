import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SONG_LAYOUTS,
  songLayoutOf,
  songPatternStyle,
  type SongLayout,
  type SongPattern,
} from "@/lib/song-layout";
import { useSongModeRequest } from "@/lib/song-mode-request";
import { useLibrary } from "@/lib/store";

const LAYOUT_PATTERN: Record<SongLayout, SongPattern[]> = {
  standard: [],
  multilang: ["grid"],
  response: ["hatch"],
};

/** The mode's pattern on the song blue, as the catalogue pill shows it. */
function Swatch({ layout }: { layout: SongLayout }) {
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-7 shrink-0 rounded-full"
      style={{
        backgroundColor: "var(--brand-blue)",
        ...songPatternStyle(LAYOUT_PATTERN[layout], 4, 0.35),
      }}
    />
  );
}

/**
 * The song's mode, beside its SONG pill in the editor header: a dropdown as
 * wide as its words, each mode shown with its catalogue pattern. The current
 * mode isn't listed again. Picking one hands it to the lyrics editor, which
 * asks its language question first when there is one.
 */
export function SongModePicker({
  setId,
  compact = false,
}: {
  setId: string;
  /** The phone editor: just the pattern (no words, no outline); the menu lists
   *  every mode with a tick on the current one. */
  compact?: boolean;
}) {
  const ask = useSongModeRequest((s) => s.ask);
  const layout = useLibrary((s) => {
    const set = s.sets[setId];
    return set ? songLayoutOf(set) : "standard";
  });
  const current = SONG_LAYOUTS.find((l) => l.value === layout) ?? SONG_LAYOUTS[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={compact ? `Song mode: ${current.label}` : undefined}
          // Same height and type as the top bar's buttons on the right.
          className={
            compact
              ? "pill inline-flex shrink-0 items-center gap-1 py-2 pl-1 pr-1.5"
              : "pill mono inline-flex w-auto shrink-0 items-center gap-2 border border-foreground bg-background px-4 py-2 text-xs uppercase tracking-wider transition hover:bg-muted"
          }
        >
          <Swatch layout={layout} />
          {!compact && current.label}
          {/* Nudged down: the caps sit low in Space Mono, so a centred icon reads high. */}
          <ChevronDown className="relative top-px h-3 w-3 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-0 dark:border-white">
        {SONG_LAYOUTS.filter((l) => compact || l.value !== layout).map((l) => (
          <DropdownMenuItem
            key={l.value}
            onClick={() => l.value !== layout && ask(setId, l.value)}
            className="mono gap-2 py-2 text-xs uppercase tracking-wider"
          >
            <Swatch layout={l.value} />
            {l.label}
            {compact && l.value === layout && <Check className="ml-auto h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
