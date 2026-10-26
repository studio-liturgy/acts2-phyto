import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * Touch screens have no HTML drag and drop, so the editors' drag handles stop
 * working on a phone. These pointer handlers stand in for it: put them on the
 * grip (give it `touch-none`), and `data-<attr>` (a number) on every row it
 * can be dragged over. Rows are found under the finger's height at the grip's
 * own x, so a row counts wherever the finger strays sideways. A mouse is left
 * to the existing HTML drag.
 *
 * The finger is followed on the window, not the grip: a reorder can remount
 * the grip (a slide moving into another section), and the drag must still end.
 */
type Drag = {
  pointerId: number;
  attr: string;
  key: string;
  gripX: number;
  onOver: (index: number, row: HTMLElement, clientY: number) => void;
  onEnd: () => void;
};

// One drag at a time. Each render refreshes its callbacks (they close over
// that render's state).
let drag: Drag | null = null;

const move = (e: PointerEvent) => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const over = document
    .elementFromPoint(drag.gripX, e.clientY)
    ?.closest<HTMLElement>(`[data-${drag.attr}]`);
  const idx = over ? Number(over.dataset[drag.key]) : NaN;
  if (over && !Number.isNaN(idx)) drag.onOver(idx, over, e.clientY);
};
const end = (e: PointerEvent) => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const { onEnd } = drag;
  drag = null;
  window.removeEventListener("pointermove", move);
  window.removeEventListener("pointerup", end);
  window.removeEventListener("pointercancel", end);
  onEnd();
};

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
  if (drag && drag.attr === attr) {
    drag.onOver = onOver;
    drag.onEnd = onEnd;
  }
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse" || drag) return;
      e.preventDefault();
      e.stopPropagation();
      drag = {
        pointerId: e.pointerId,
        attr,
        key: attr.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()),
        gripX: e.clientX,
        onOver,
        onEnd,
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
      onStart();
    },
  };
}
