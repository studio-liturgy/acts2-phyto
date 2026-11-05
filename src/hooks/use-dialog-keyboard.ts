import { useEffect } from "react";
import { dialogKeyboardBox } from "@/lib/dialog-keyboard";

/**
 * Phone: while the keyboard is up for a text box inside a pop-up dialog,
 * publish the visible area (--dkb-top, --dkb-h, data-dialog-kb on <html>) so
 * styles.css centres the dialog above the keys. A dialog that focuses its box
 * as it opens raises the keyboard before it has settled, and iOS can't scroll
 * a fixed pop-up into view, so without this the box sat under the keyboard.
 */
export function useDialogKeyboard(enabled: boolean) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!enabled || !vv) return;
    const root = document.documentElement;
    let frame = 0;
    const read = () => {
      frame = 0;
      const a = document.activeElement;
      const inDialog =
        (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement) &&
        !!a.closest('[role="dialog"], [role="alertdialog"]');
      const box = inDialog
        ? dialogKeyboardBox({
            innerHeight: window.innerHeight,
            vvHeight: vv.height,
            vvTop: vv.offsetTop,
          })
        : null;
      if (box) {
        root.style.setProperty("--dkb-top", `${box.top}px`);
        root.style.setProperty("--dkb-h", `${box.height}px`);
        root.setAttribute("data-dialog-kb", "");
      } else if (root.hasAttribute("data-dialog-kb")) {
        root.removeAttribute("data-dialog-kb");
        root.style.removeProperty("--dkb-top");
        root.style.removeProperty("--dkb-h");
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    // The keyboard slides in over several frames after focus; read on each
    // viewport change, and once more after the slide in case iOS skipped one.
    const onFocus = () => {
      schedule();
      setTimeout(schedule, 350);
    };
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onFocus);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onFocus);
      root.removeAttribute("data-dialog-kb");
    };
  }, [enabled]);
}
