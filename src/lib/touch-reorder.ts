import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * Touch screens have no HTML drag and drop, so the editors' drag handles stop
 * working on a phone. These pointer handlers stand in for it: put them on the
 * grip, and `data-<attr>` (a number) on every row it can be dragged over.
 * The finger is followed across the whole screen (pointer capture), and each
 * row it passes (at the grip's x) reports through `onOver`, like `onDragOver`.
 * A mouse is left to the existing HTML drag. Give the grip `touch-none`.
 */
// One drag at a time, kept outside the handlers: a reorder re-renders the
// list, which hands out fresh handlers mid-drag.
let activePointer: number | null = null;
// Rows are found under the finger's height at the grip's own x, so a row
// counts wherever the finger strays sideways (and only grip columns need the
// attribute).
let gripX = 0;

export function touchReorder({
  attr,
  onStart,
  onOver,
  onEnd,
}: {
  /** The row attribute, without "data-" (e.g. "row-idx" for data-row-idx). */
  attr: string;
  onStart: () => void;
  /** The row's attribute as a number, the row, and the finger's height. */
  onOver: (index: number, row: HTMLElement, clientY: number) => void;
  onEnd: () => void;
}) {
  const key = attr.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  const end = (e: ReactPointerEvent<HTMLElement>) => {
    if (activePointer !== e.pointerId) return;
    activePointer = null;
    onEnd();
  };
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse") return;
      e.preventDefault();
      e.stopPropagation();
      activePointer = e.pointerId;
      gripX = e.clientX;
      e.currentTarget.setPointerCapture(e.pointerId);
      onStart();
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      if (activePointer !== e.pointerId) return;
      const over = document
        .elementFromPoint(gripX, e.clientY)
        ?.closest<HTMLElement>(`[data-${attr}]`);
      const idx = over ? Number(over.dataset[key]) : NaN;
      if (over && !Number.isNaN(idx)) onOver(idx, over, e.clientY);
    },
    onPointerUp: end,
    onPointerCancel: end,
  };
}

/** The attribute to put on each row: `{...reorderTarget("row-idx", i)}`. */
export function reorderRow(attr: string, index: number): Record<string, number> {
  return { [`data-${attr}`]: index };
}
