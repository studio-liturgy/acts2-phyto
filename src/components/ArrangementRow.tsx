import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { hideDragGhost } from "@/lib/drag-ghost";
import { touchReorder } from "@/lib/touch-reorder";
import { DotsGrip } from "@/components/DragBits";
import { addEntry, removeEntry, type Arrangement, type SectionOption } from "@/lib/arrangements";

/**
 * A song's arrangement in a gathering, as a row of section pills in play order.
 * Drag a pill to move it, its x removes it from the arrangement (the slides are
 * only hidden from view; the song is untouched), and "+" adds any section to
 * the end, repeats included. The last pill can't be removed: `onBlocked` gets
 * the click position so the presenter can show its "at least 1 section"
 * warning. Each pill wears its section's colour from the slide grid.
 */
export function ArrangementRow({
  options,
  arrangement,
  tints,
  onChange,
  onBlocked,
  column = false,
  removeOnly = false,
  solid = false,
}: {
  options: SectionOption[];
  arrangement: Arrangement;
  tints: string[];
  onChange: (next: Arrangement) => void;
  onBlocked: (clientX: number, clientY: number) => void;
  /** Stacked down the gutter beside the phone preview instead of a row. */
  column?: boolean;
  /** Scripture and message: sections can only be taken out and put back (in
   *  their written place), not moved or repeated. */
  removeOnly?: boolean;
  /** The phone's version: pills on an opaque fill (they float over slides),
   *  all one width, each with a grip to drag by touch; "+" opens to its left. */
  solid?: boolean;
}) {
  const byKey = new Map(options.map((o) => [o.key, o]));
  // What "+" offers: any section (repeats allowed), or only the ones taken out.
  const addable = removeOnly ? options.filter((o) => !arrangement.includes(o.key)) : options;
  // Drag to reorder, the same way as the sets in a gathering: no browser
  // ghost; the pills reorder live under the pointer (the dragged one dimmed)
  // and the order commits on drop. Slots carry a stable key so the dragged
  // pill keeps its identity as the row reorders around it.
  type Slot = { slot: string; key: string };
  const slotsOf = (arr: Arrangement): Slot[] => arr.map((k, i) => ({ slot: `${k}~${i}`, key: k }));
  const [liveOrder, setLiveOrder] = useState<Slot[] | null>(null);
  const liveRef = useRef<Slot[] | null>(null);
  const dragIndex = useRef<number | null>(null);
  const [dragUiIndex, setDragUiIndex] = useState<number | null>(null);

  // Moves the dragged pill to slot `i` (HTML drag over a pill, or a finger).
  const moveTo = (i: number) => {
    const from = dragIndex.current;
    if (from === null || from === i) return;
    const next = [...(liveRef.current ?? slotsOf(arrangement))];
    const [moved] = next.splice(from, 1);
    next.splice(i, 0, moved);
    dragIndex.current = i;
    setDragUiIndex(i);
    liveRef.current = next;
    setLiveOrder(next);
  };

  // Called from onDrop and onDragEnd (fallback); the ref makes the second a no-op.
  const commit = () => {
    if (liveRef.current) {
      const next = liveRef.current.map((s) => s.key);
      if (next.some((k, i) => k !== arrangement[i])) onChange(next);
    }
    liveRef.current = null;
    dragIndex.current = null;
    setLiveOrder(null);
    setDragUiIndex(null);
  };

  return (
    <div
      className={
        column
          ? `flex flex-col gap-1.5 ${solid ? "items-stretch" : "items-end"}`
          : "mb-2 flex flex-wrap items-center gap-1.5"
      }
    >
      {(liveOrder ?? slotsOf(arrangement)).map(({ slot, key }, i) => {
        const opt = byKey.get(key);
        if (!opt) return null;
        const tint = tints[opt.index % tints.length];
        return (
          <div
            key={slot}
            draggable={!removeOnly}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              hideDragGhost(e);
              dragIndex.current = i;
              setDragUiIndex(i);
            }}
            onDragOver={(e) => {
              const from = dragIndex.current;
              if (from === null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              moveTo(i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              commit();
            }}
            onDragEnd={commit}
            data-arr-pill={i}
            className={`pill mono flex h-7 items-center gap-1 pr-1.5 text-[10px] uppercase tracking-wider ${
              solid && !removeOnly ? "pl-1" : "pl-3"
            } ${removeOnly ? "" : "cursor-grab active:cursor-grabbing"} ${dragUiIndex === i ? "opacity-50" : ""}`}
            style={{
              backgroundColor: `color-mix(in oklab, ${tint} 45%, ${solid ? "var(--background)" : "transparent"})`,
            }}
          >
            {solid && !removeOnly && (
              <span
                className="flex h-full w-6 shrink-0 touch-none items-center justify-center [-webkit-touch-callout:none]"
                aria-label="Drag to reorder"
                {...touchReorder({
                  attr: "arr-pill",
                  onStart: () => {
                    dragIndex.current = i;
                    setDragUiIndex(i);
                  },
                  onOver: (idx) => moveTo(idx),
                  onEnd: commit,
                })}
              >
                <DotsGrip className="opacity-70" size={12} />
              </span>
            )}
            <span className={`max-w-[9rem] truncate ${solid ? "flex-1" : ""}`}>{opt.label}</span>
            <button
              type="button"
              onClick={(e) => {
                const next = removeEntry(arrangement, i);
                if (next) onChange(next);
                else onBlocked(e.clientX, e.clientY);
              }}
              className="rounded-full p-0.5 text-muted-foreground opacity-60 transition hover:text-foreground hover:opacity-100"
              title="Remove"
              aria-label={`Remove ${opt.label}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
      {addable.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={`pill flex h-7 w-7 shrink-0 items-center justify-center border border-foreground transition hover:bg-foreground hover:text-background ${solid ? "self-end bg-background" : ""}`}
              title="Add section"
              aria-label="Add section"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={solid ? "left" : "bottom"}
            align={column ? "end" : "start"}
            sideOffset={8}
            className="w-max min-w-0"
          >
            {addable.map((o) => (
              <DropdownMenuItem
                key={o.key}
                onClick={() =>
                  onChange(
                    removeOnly
                      ? options
                          .filter((x) => x.key === o.key || arrangement.includes(x.key))
                          .map((x) => x.key)
                      : addEntry(arrangement, o.key),
                  )
                }
                className={`mono uppercase text-[10px] tracking-wider focus:bg-foreground focus:text-background ${
                  column ? "justify-end text-right" : ""
                }`}
              >
                {o.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
