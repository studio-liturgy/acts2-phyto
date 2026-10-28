import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Picking whole lines in a phone song grid, in the look of iOS's own text
 * selection: each line is its own text box, so iOS's handles can't cross
 * from one line to the next. Press and hold a line to pick it (the keyboard
 * goes down); keep the finger down and drag to take in more; then drag the
 * blue handles at either end. Cut / Copy / Delete float above, like iOS's
 * menu. A tap anywhere else lets go.
 */

type Box = { top: number; bottom: number; left: number; right: number };
const boxOf = (el: HTMLElement | null): Box | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
};

/** The handles and the Cut / Copy / Delete menu over a run of picked lines. */
export function PhoneLineSelection({
  scroller,
  first,
  last,
  onHandle,
  onCut,
  onCopy,
  onDelete,
  onClear,
}: {
  scroller: HTMLElement | null;
  /** The first and last picked line's cell. */
  first: () => HTMLElement | null;
  last: () => HTMLElement | null;
  /** A handle dragged over this element. */
  onHandle: (end: "start" | "end", el: Element) => void;
  onCut: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ a: Box; b: Box; view: Box } | null>(null);
  const get = useRef({ first, last });
  get.current = { first, last };

  // Follow the lines as the grid scrolls or re-renders.
  useLayoutEffect(() => {
    let frame = 0;
    const read = () => {
      const a = boxOf(get.current.first());
      const b = boxOf(get.current.last());
      const view = boxOf(scroller);
      setPos((p) => {
        if (!a || !b || !view) return null;
        const same =
          p &&
          p.a.top === a.top &&
          p.a.left === a.left &&
          p.b.bottom === b.bottom &&
          p.b.right === b.right &&
          p.view.top === view.top &&
          p.view.bottom === view.bottom;
        return same ? p : { a, b, view };
      });
      frame = requestAnimationFrame(read);
    };
    read();
    return () => cancelAnimationFrame(frame);
  }, [scroller]);

  // A tap anywhere else lets go.
  const clear = useRef(onClear);
  clear.current = onClear;
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (root.current?.contains(e.target as Node)) return;
      clear.current();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, []);

  if (!pos || typeof document === "undefined") return null;
  const { a, b, view } = pos;
  const midX = (a.left + a.right) / 2;
  const inView = (y: number) => y >= view.top - 4 && y <= view.bottom + 4;
  // The menu above the first line, or under the last when there's no room.
  const menuAbove = a.top - 52 >= view.top;
  const menuTop = menuAbove ? a.top - 52 : b.bottom + 22;

  const drag = (end: "start" | "end") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const move = (ev: PointerEvent) => {
      const el = document.elementFromPoint(midX, ev.clientY);
      if (el) onHandle(end, el);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const HANDLE = "fixed z-[60] flex w-8 touch-none select-none justify-center";
  const knob = "h-3 w-3 shrink-0 rounded-full bg-[var(--brand-blue)]";
  const stem = "w-0.5 bg-[var(--brand-blue)]";

  return createPortal(
    <div ref={root}>
      {inView(a.top) && (
        <div
          className={`${HANDLE} flex-col items-center`}
          style={{ left: a.left - 16, top: a.top - 12, height: a.bottom - a.top + 12 }}
          onPointerDown={drag("start")}
          aria-label="Start of selection"
        >
          <span className={knob} />
          <span className={`${stem} flex-1`} />
        </div>
      )}
      {inView(b.bottom) && (
        <div
          className={`${HANDLE} flex-col items-center`}
          style={{ left: b.right - 16, top: b.top, height: b.bottom - b.top + 12 }}
          onPointerDown={drag("end")}
          aria-label="End of selection"
        >
          <span className={`${stem} flex-1`} />
          <span className={knob} />
        </div>
      )}
      {inView(menuTop) && (
        <div
          className="fixed z-[60] flex -translate-x-1/2 divide-x divide-foreground/15 overflow-hidden rounded-full border border-foreground/15 bg-popover text-[15px] text-popover-foreground shadow-xl"
          style={{ left: midX, top: menuTop }}
        >
          {(
            [
              ["Cut", onCut],
              ["Copy", onCopy],
              ["Delete", onDelete],
            ] as const
          ).map(([label, act]) => (
            <button
              key={label}
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={act}
              className="px-4 py-2.5 active:bg-foreground/10"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
