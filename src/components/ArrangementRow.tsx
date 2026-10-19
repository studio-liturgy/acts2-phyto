import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { hideDragGhost } from "@/lib/drag-ghost";
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
}: {
  options: SectionOption[];
  arrangement: Arrangement;
  tints: string[];
  onChange: (next: Arrangement) => void;
  onBlocked: (clientX: number, clientY: number) => void;
  /** Stacked down the gutter beside the phone preview instead of a row. */
  column?: boolean;
}) {
  const byKey = new Map(options.map((o) => [o.key, o]));
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
        column ? "flex flex-col items-end gap-1.5" : "mb-2 flex flex-wrap items-center gap-1.5"
      }
    >
      {(liveOrder ?? slotsOf(arrangement)).map(({ slot, key }, i) => {
        const opt = byKey.get(key);
        if (!opt) return null;
        const tint = tints[opt.index % tints.length];
        return (
          <div
            key={slot}
            draggable
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
              if (from === i) return;
              const next = [...(liveOrder ?? slotsOf(arrangement))];
              const [moved] = next.splice(from, 1);
              next.splice(i, 0, moved);
              dragIndex.current = i;
              setDragUiIndex(i);
              liveRef.current = next;
              setLiveOrder(next);
            }}
            onDrop={(e) => {
              e.preventDefault();
              commit();
            }}
            onDragEnd={commit}
            className={`pill mono flex cursor-grab items-center gap-1 py-1 pl-3 pr-1 text-[10px] uppercase tracking-wider active:cursor-grabbing ${
              dragUiIndex === i ? "opacity-50" : ""
            }`}
            style={{ backgroundColor: `color-mix(in oklab, ${tint} 45%, transparent)` }}
          >
            <span className="max-w-[9rem] truncate">{opt.label}</span>
            <button
              type="button"
              onClick={(e) => {
                const next = removeEntry(arrangement, i);
                if (next) onChange(next);
                else onBlocked(e.clientX, e.clientY);
              }}
              className="flex h-5 w-5 items-center justify-center rounded-full transition hover:bg-foreground hover:text-background"
              title="Remove"
              aria-label={`Remove ${opt.label}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="pill flex h-7 w-7 shrink-0 items-center justify-center border border-foreground transition hover:bg-foreground hover:text-background"
            title="Add section"
            aria-label="Add section"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={column ? "end" : "start"}>
          {options.map((o) => (
            <DropdownMenuItem
              key={o.key}
              onClick={() => onChange(addEntry(arrangement, o.key))}
              className="mono uppercase text-[10px] tracking-wider focus:bg-foreground focus:text-background"
            >
              {o.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
