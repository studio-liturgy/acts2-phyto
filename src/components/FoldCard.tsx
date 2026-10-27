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
  open: openProp,
  onOpenChange,
}: {
  /** Controlled: a group of cards where one opens at a time. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: ReactNode;
  /** What the bar does, read out with "Show" / "Hide" in front. */
  ariaLabel: string;
  children: ReactNode;
}) {
  const [openSelf, setOpenSelf] = useState(false);
  const open = openProp ?? openSelf;
  const setOpen = (fn: (o: boolean) => boolean) => {
    const next = fn(open);
    if (onOpenChange) onOpenChange(next);
    else setOpenSelf(next);
  };
  return (
    // Folded, it's a pill the size of the importer's search bar (40px tall,
    // text 16px in); open, it rounds like the Chord Sheet.
    <div
      data-fold-card
      className={`overflow-hidden border border-foreground transition-[border-radius] duration-200 ease-out ${open ? "rounded-2xl" : "rounded-[20px]"}`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`${open ? "Hide" : "Show"} ${ariaLabel}`}
        aria-expanded={open}
        className={`mono flex w-full items-center justify-between gap-2 px-4 text-left text-[10px] uppercase leading-5 tracking-wider outline-none transition-[padding,background-color] duration-200 ease-out focus-visible:bg-muted ${open ? "pb-3 pt-4" : "py-[9px] hover:bg-muted"}`}
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
