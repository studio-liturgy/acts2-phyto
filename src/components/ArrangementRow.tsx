import { useState } from "react";
import { Plus, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  addEntry,
  moveEntry,
  removeEntry,
  type Arrangement,
  type SectionOption,
} from "@/lib/arrangements";

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
  /** Stacked down the gutter beside the phone preview, outlined like the
   *  eye's pills there. The slides view row has no outline. */
  column?: boolean;
}) {
  const byKey = new Map(options.map((o) => [o.key, o]));
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const endDrag = () => {
    setDragFrom(null);
    setDragOver(null);
  };

  return (
    <div
      className={
        column ? "flex flex-col items-end gap-1.5" : "mb-2 flex flex-wrap items-center gap-1.5"
      }
    >
      {arrangement.map((key, i) => {
        const opt = byKey.get(key);
        if (!opt) return null;
        const tint = tints[opt.index % tints.length];
        // Where a drop on this pill would land the dragged one: after it when
        // dragging forwards, before it when dragging backwards.
        const after = dragFrom !== null && dragFrom < i;
        const marker =
          dragFrom !== null && dragOver === i && dragFrom !== i
            ? column
              ? after
                ? "shadow-[0_3px_0_0_var(--foreground)]"
                : "shadow-[0_-3px_0_0_var(--foreground)]"
              : after
                ? "shadow-[3px_0_0_0_var(--foreground)]"
                : "shadow-[-3px_0_0_0_var(--foreground)]"
            : "";
        return (
          <div
            key={`${key}-${i}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              setDragFrom(i);
            }}
            onDragOver={(e) => {
              if (dragFrom === null) return;
              e.preventDefault();
              if (dragOver !== i) setDragOver(i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom !== null && dragFrom !== i)
                onChange(moveEntry(arrangement, dragFrom, i));
              endDrag();
            }}
            onDragEnd={endDrag}
            className={`pill mono flex cursor-grab items-center gap-1 py-1 pl-3 pr-1 text-[10px] uppercase tracking-wider active:cursor-grabbing ${
              column ? "border border-foreground" : ""
            } ${dragFrom === i ? "opacity-40" : ""} ${marker}`}
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
              className="mono uppercase text-xs tracking-wider focus:bg-foreground focus:text-background"
            >
              {o.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
