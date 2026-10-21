import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * A bordered card whose whole title bar folds and unfolds its body, the
 * Chord Sheet's look and motion: the height animates through a grid row going
 * 0fr to 1fr (200ms), the chevron flips. Starts folded.
 */
export function FoldCard({
  title,
  ariaLabel,
  children,
}: {
  title: ReactNode;
  /** What the bar does, read out with "Show" / "Hide" in front. */
  ariaLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-foreground">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`${open ? "Hide" : "Show"} ${ariaLabel}`}
        aria-expanded={open}
        className={`mono flex w-full items-center justify-between gap-2 p-4 text-left text-[10px] uppercase tracking-wider outline-none transition focus-visible:bg-muted ${open ? "pb-3" : "hover:bg-muted"}`}
      >
        <span>{title}</span>
        <ChevronDown
          className={`relative top-px h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-4 pb-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
