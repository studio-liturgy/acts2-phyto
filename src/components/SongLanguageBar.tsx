import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { DotsGrip } from "@/components/DragBits";
import { hideDragGhost } from "@/lib/drag-ghost";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { langColor, langDef, pickerOrder, type LangCode } from "@/lib/langs";
import { MAX_SHOWN_LANGS, restackSlides, shownLangs, songLangs } from "@/lib/multiling";
import { useLibrary } from "@/lib/store";
import type { Set as PhytoSet } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Which of a Multilanguage song's languages are stacked on its slides, and in
 * what order (ported from watch's language bar, per song instead of global).
 *
 * Order is the point: the languages are drawn top to bottom exactly as the
 * chips run, so drag a chip to move it. The x hides a language (at least one
 * always shows); + Language brings back one of the song's other columns, up
 * to four at once. The choice is the song's, so the output window and phones
 * follow it. Used in the song editor and the presenter's rail.
 */
export function SongLanguageBar({
  set,
  orientation = "vertical",
  className = "",
}: {
  set: PhytoSet;
  orientation?: "horizontal" | "vertical";
  className?: string;
}) {
  const updateSet = useLibrary((s) => s.updateSet);
  const dragFrom = useRef<number | null>(null);
  const [dragging, setDragging] = useState<LangCode | null>(null);

  const langs = songLangs(set);
  if (langs.length === 0) return null;
  const selected = shownLangs(langs, set.langsShown);
  const available = pickerOrder(
    langs.filter((l) => !selected.includes(l)).map((code) => langDef(code)),
  );
  const vertical = orientation === "vertical";

  const write = (next: LangCode[]) =>
    updateSet(set.id, { langsShown: next, slides: restackSlides(set.slides, next) });
  const add = (code: LangCode) => {
    if (selected.length < MAX_SHOWN_LANGS) write([...selected, code]);
  };
  const remove = (code: LangCode) => {
    if (selected.length > 1) write(selected.filter((c) => c !== code));
  };
  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = [...selected];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    write(next);
  };

  return (
    <div
      className={cn(
        vertical ? "flex flex-col items-stretch gap-1.5" : "flex flex-wrap items-center gap-1.5",
        className,
      )}
    >
      {selected.map((code, i) => {
        const def = langDef(code);
        return (
          <button
            key={code}
            type="button"
            draggable
            onDragStart={(e) => {
              dragFrom.current = i;
              setDragging(code);
              e.dataTransfer.effectAllowed = "move";
              hideDragGhost(e);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              // Live preview: the dragged chip moves through the row as you go.
              if (dragFrom.current !== null && dragFrom.current !== i) {
                move(dragFrom.current, i);
                dragFrom.current = i;
              }
            }}
            onDragEnd={() => {
              dragFrom.current = null;
              setDragging(null);
            }}
            className={cn(
              "mono group flex h-7 cursor-grab items-center gap-1 rounded-full border px-2 text-xs uppercase tracking-wider text-foreground active:cursor-grabbing",
              dragging === code && "opacity-50",
            )}
            style={{
              borderColor: langColor(code),
              backgroundColor: `color-mix(in oklab, ${langColor(code)} 14%, transparent)`,
            }}
            title={`${def.label}: drag to reorder`}
          >
            <DotsGrip className="opacity-40" size={10} />
            <span>{def.short}</span>
            {selected.length > 1 && (
              <X
                className="ml-auto h-3 w-3 shrink-0 cursor-pointer opacity-40 hover:opacity-100"
                role="button"
                aria-label={`Hide ${def.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(code);
                }}
              />
            )}
          </button>
        );
      })}

      {available.length > 0 && selected.length < MAX_SHOWN_LANGS && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "mono flex h-7 items-center justify-center gap-1 rounded-full border border-dashed px-3 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground",
                vertical && "w-full",
              )}
            >
              <Plus className="h-3 w-3" />
              Language
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className={cn(
              "max-h-80 overflow-y-auto dark:border-white",
              vertical ? "w-[var(--radix-dropdown-menu-trigger-width)] min-w-0" : "min-w-[14rem]",
            )}
          >
            {available.map((l) => (
              <DropdownMenuItem
                key={l.code}
                onSelect={() => add(l.code)}
                className="gap-3 focus:!bg-[var(--lang-tint)] data-[highlighted]:!bg-[var(--lang-tint)]"
                style={
                  {
                    "--lang-tint": `color-mix(in oklab, ${langColor(l.code)} 22%, transparent)`,
                  } as React.CSSProperties
                }
              >
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: langColor(l.code) }}
                />
                <span className="mono shrink-0 uppercase">{l.short}</span>
                <span className="mono ml-auto text-right text-[10px] uppercase tracking-wider text-muted-foreground">
                  {l.label}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
