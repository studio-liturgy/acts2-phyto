import { useEffect, useRef } from "react";
import { holdDelay, lineHold } from "@/lib/line-select";

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
      // Chords (and the strip above a line), role and delete buttons are
      // taps, never the start of a pick.
      if (target.closest?.("button, input, select, a, [contenteditable], [data-chord-strip]"))
        return;
      start = { x: t.clientX, y: t.clientY };
      timer = window.setTimeout(() => {
        timer = 0;
        // A tap that re-rendered its row (a chord opening) leaves a detached
        // target whose lift never reaches us: that was a tap, not a hold.
        if (!start || !target.isConnected || !cb.current.onHold(target)) return;
        active = true;
        lineHold.active = true;
        // The keyboard and any word selection go: this is a line pick now.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        window.getSelection()?.removeAllRanges();
      }, holdDelay());
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
    // Any lift anywhere ends it (followed on the document: a tap that opened
    // a line can re-render the touched cell, and its lift never bubbles to
    // the editor). The "was a hold" flag clears a moment later, so the
    // editors' tap handler, also on the document, still sees it.
    const onEnd = (e: TouchEvent) => {
      if (active) e.preventDefault();
      const was = active;
      active = false;
      cancel();
      if (was) setTimeout(() => (lineHold.active = false), 0);
    };
    const noMenu = (e: Event) => {
      if (active) e.preventDefault();
    };
    // Anything taking focus while the finger is down (a chord box, a line
    // opened by the tap) means it was a tap: no pick.
    const onFocusIn = () => {
      if (!active) cancel();
    };
    scroller.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { capture: true, passive: false });
    document.addEventListener("touchcancel", onEnd, true);
    scroller.addEventListener("contextmenu", noMenu);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      cancel();
      lineHold.active = false;
      document.removeEventListener("focusin", onFocusIn);
      scroller.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd, true);
      document.removeEventListener("touchcancel", onEnd, true);
      scroller.removeEventListener("contextmenu", noMenu);
    };
  }, [scroller, enabled]);
}
