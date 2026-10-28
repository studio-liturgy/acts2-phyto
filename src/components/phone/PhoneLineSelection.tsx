import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DotsGrip } from "@/components/DragBits";

/**
 * Picking whole lines in a phone song grid. Each line is its own text box, so
 * the phone's own selection can't cross lines. Press and hold a line that
 * isn't being typed in to pick it (the keyboard goes down); keep the finger
 * down and drag to take in more; then drag the grips centred on the run's top
 * and bottom edges. Cut / Copy / Delete sit above in phyto's small pills. A
 * tap anywhere else lets go; scrolling keeps the pick.
 */

type Box = { top: number; bottom: number; left: number; right: number };
const boxOf = (el: HTMLElement | null): Box | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
};

/** The grips and the Cut / Copy / Delete pills over a run of picked lines. */
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
  /** A grip dragged over this element. */
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
          p.a.right === a.right &&
          p.b.bottom === b.bottom &&
          p.view.top === view.top &&
          p.view.bottom === view.bottom;
        return same ? p : { a, b, view };
      });
      frame = requestAnimationFrame(read);
    };
    read();
    return () => cancelAnimationFrame(frame);
  }, [scroller]);

  // A TAP anywhere else lets go (finger down and up without moving). A swipe
  // to scroll keeps the pick.
  const clear = useRef(onClear);
  clear.current = onClear;
  useEffect(() => {
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = root.current?.contains(e.target as Node) ? null : { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 10) clear.current();
    };
    const onCancel = () => (down = null);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onCancel, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("pointercancel", onCancel, true);
    };
  }, []);

  if (!pos || typeof document === "undefined") return null;
  const { a, b, view } = pos;
  const midX = (a.left + a.right) / 2;
  const inView = (y: number) => y >= view.top - 4 && y <= view.bottom + 4;
  // The pills above the top grip, or under the bottom one when there's no room.
  const menuAbove = a.top - 54 >= view.top;
  const menuTop = menuAbove ? a.top - 54 : b.bottom + 18;

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

  // A grip pill centred on the edge, with room around it for a thumb.
  const grip = (end: "start" | "end", y: number) => (
    <div
      className="fixed z-[60] -translate-x-1/2 -translate-y-1/2 touch-none select-none p-2"
      style={{ left: midX, top: y }}
      onPointerDown={drag(end)}
      aria-label={
        end === "start" ? "Move the start of the selection" : "Move the end of the selection"
      }
    >
      <span className="flex h-5 w-10 items-center justify-center rounded-full border border-foreground bg-background">
        <DotsGrip size={10} className="rotate-90" />
      </span>
    </div>
  );

  const PILL =
    "pill mono px-3 py-1.5 text-[10px] uppercase tracking-wider transition active:bg-foreground active:text-background";

  return createPortal(
    <div ref={root}>
      {inView(a.top) && grip("start", a.top)}
      {inView(b.bottom) && grip("end", b.bottom)}
      {inView(menuTop) && (
        <div
          className="fixed z-[60] flex -translate-x-1/2 gap-1 rounded-full border border-foreground bg-background p-1 shadow-md"
          style={{ left: midX, top: menuTop }}
        >
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={onCut}
            className={PILL}
          >
            Cut
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={onCopy}
            className={PILL}
          >
            Copy
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={onDelete}
            className="pill mono px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--brand-red)] transition active:bg-[var(--brand-red)] active:text-[var(--brand-white)]"
          >
            Delete
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
