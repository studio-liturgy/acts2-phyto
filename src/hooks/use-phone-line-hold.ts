import { useEffect, useRef } from "react";
import { lineHold } from "@/lib/line-select";

const HOLD_MS = 450;

/** Press and hold inside `scroller` (finger still) to start picking lines. */
export function usePhoneLineHold({
  scroller,
  enabled,
  onHold,
  onExtend,
}: {
  scroller: HTMLElement | null;
  enabled: boolean;
  /** The element under the held finger; return false to ignore the hold. */
  onHold: (el: Element) => boolean;
  /** The element under the finger as it moves on after the hold. */
  onExtend: (el: Element) => void;
}) {
  const cb = useRef({ onHold, onExtend });
  cb.current = { onHold, onExtend };
  useEffect(() => {
    if (!scroller || !enabled) return;
    let timer = 0;
    let start: { x: number; y: number } | null = null;
    let active = false;
    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = 0;
      start = null;
    };
    const onStart = (e: TouchEvent) => {
      cancel();
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const target = e.target as Element;
      // The line being typed in keeps the phone's own press-and-hold (move
      // the cursor, pick words); picking whole lines starts on the others.
      if (target.closest?.("textarea, input") === document.activeElement) return;
      start = { x: t.clientX, y: t.clientY };
      timer = window.setTimeout(() => {
        timer = 0;
        if (!start || !cb.current.onHold(target)) return;
        active = true;
        lineHold.active = true;
        // The keyboard and any word selection go: this is a line pick now.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        window.getSelection()?.removeAllRanges();
      }, HOLD_MS);
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || !start) return;
      if (!active) {
        if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) cancel();
        return;
      }
      e.preventDefault();
      const el = document.elementFromPoint(start.x, t.clientY);
      if (el) cb.current.onExtend(el);
    };
    const onEnd = (e: TouchEvent) => {
      if (active) e.preventDefault();
      active = false;
      lineHold.active = false;
      cancel();
    };
    const noMenu = (e: Event) => {
      if (active) e.preventDefault();
    };
    scroller.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    scroller.addEventListener("touchend", onEnd, { passive: false });
    scroller.addEventListener("touchcancel", onEnd);
    scroller.addEventListener("contextmenu", noMenu);
    return () => {
      cancel();
      lineHold.active = false;
      scroller.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      scroller.removeEventListener("touchend", onEnd);
      scroller.removeEventListener("touchcancel", onEnd);
      scroller.removeEventListener("contextmenu", noMenu);
    };
  }, [scroller, enabled]);
}
