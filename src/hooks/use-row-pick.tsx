import { useEffect, useRef, useState } from "react";
import { usePhoneLineHold } from "@/hooks/use-phone-line-hold";
import { PhoneLineSelection } from "@/components/phone/PhoneLineSelection";
import { copyText, moveRunEnd, runFrom } from "@/lib/line-select";
import type { RowRun } from "@/lib/row-pick";

/**
 * Picking whole rows (verses, points, images) in the scripture and message
 * editors, as in the song grids. Every row carries `data-pick-row={n}`.
 *
 * Computer: drag down from one row into another to pick the run; Cmd/Ctrl+C
 * copies it, Cmd/Ctrl+X cuts, Delete/Backspace removes, Cmd/Ctrl+V pastes over
 * it, Esc or typing lets go. Phone: press and hold a row (not the one being
 * typed in), drag on or move the grips, then Cut / Copy / Delete.
 *
 * Pasting what was copied back into the editor (over a pick, or into a row
 * being typed in, which puts it after that row) is up to `paste`, which
 * returns false to leave the paste to the text box.
 */
export function useRowPick({
  scopeRef,
  scroller,
  enabled,
  phone,
  copy,
  remove,
  paste,
}: {
  /** The editor holding the rows. */
  scopeRef: React.RefObject<HTMLElement | null>;
  /** The element that scrolls the rows (the phone's hold checks it). */
  scroller: HTMLElement | null;
  enabled: boolean;
  phone: boolean;
  /** Keep the run on the in-page clipboard and return its words. `version`
   *  is the column the pick started in (computer), else null. */
  copy: (run: RowRun, version: string | null) => string;
  remove: (run: RowRun) => void;
  /** Paste copied rows over `run`, or after row `after`. */
  paste: (text: string, run: RowRun | null, after: number | null) => boolean;
}) {
  const [run, setRun] = useState<RowRun | null>(null);
  const version = useRef<string | null>(null);
  const cb = useRef({ copy, remove, paste });
  cb.current = { copy, remove, paste };

  const rowOf = (el: Element | null): number | null => {
    const row = el?.closest?.("[data-pick-row]");
    if (!row || !scopeRef.current?.contains(row)) return null;
    const n = Number(row.getAttribute("data-pick-row"));
    return Number.isNaN(n) ? null : n;
  };
  const rowEl = (n: number) =>
    scopeRef.current?.querySelector<HTMLElement>(`[data-pick-row="${n}"]`) ?? null;

  // Computer: drag from one row into another.
  const onMouseDown = (e: React.MouseEvent) => {
    if (!enabled || e.button !== 0) return;
    const target = e.target as Element;
    if (target.closest("button, input, [draggable=true], [data-no-pick]")) return;
    const anchor = rowOf(target);
    setRun(null);
    if (anchor === null) return;
    version.current = target.closest("[data-col]")?.getAttribute("data-col") ?? null;
    const onMove = (ev: MouseEvent) => {
      const r = rowOf(document.elementFromPoint(ev.clientX, ev.clientY));
      if (r === null) return;
      if (r === anchor) {
        setRun(null);
        return;
      }
      window.getSelection()?.removeAllRanges();
      setRun(runFrom(anchor, r));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // Pasting copied rows into a row being typed in: they go after it.
  useEffect(() => {
    const scope = scopeRef.current;
    if (!enabled || !scope) return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as Element | null;
      if (!target || !scope.contains(target)) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (cb.current.paste(text, null, rowOf(target))) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("paste", onPaste, true);
    return () => document.removeEventListener("paste", onPaste, true);
    // The scope is in place by the time the scroller is (both found on mount).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, scroller]);

  // With a run picked: the clipboard and keys act on it.
  useEffect(() => {
    if (!run) return;
    const onCopy = (e: ClipboardEvent) => {
      e.clipboardData?.setData("text/plain", cb.current.copy(run, version.current));
      e.preventDefault();
    };
    const onCut = (e: ClipboardEvent) => {
      onCopy(e);
      setRun(null);
      cb.current.remove(run);
    };
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text/plain") ?? "";
      setRun(null);
      if (cb.current.paste(text, run, null)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        e.stopPropagation();
        setRun(null);
        cb.current.remove(run);
      } else if (e.key === "Escape") {
        setRun(null);
      } else if (!e.metaKey && !e.ctrlKey && e.key.length === 1) {
        setRun(null);
      }
    };
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [run]);

  // Leaving the editor (readOnly, another set) drops the pick.
  useEffect(() => {
    if (!enabled) setRun(null);
  }, [enabled]);

  // Phone: press and hold.
  const holdAnchor = useRef<number | null>(null);
  usePhoneLineHold({
    scroller,
    enabled: phone && enabled,
    onHold: (el) => {
      const r = rowOf(el);
      if (r === null) return false;
      holdAnchor.current = r;
      version.current = null;
      setRun({ from: r, to: r });
      return true;
    },
    onExtend: (el) => {
      const r = rowOf(el);
      if (r !== null && holdAnchor.current !== null) setRun(runFrom(holdAnchor.current, r));
    },
  });
  const take = (doCopy: boolean, doRemove: boolean) => {
    if (!run) return;
    if (doCopy) copyText(cb.current.copy(run, null));
    setRun(null);
    if (doRemove) cb.current.remove(run);
  };
  const overlay =
    phone && run ? (
      <PhoneLineSelection
        scroller={scroller}
        first={() => rowEl(run.from)}
        last={() => rowEl(run.to)}
        onHandle={(end, el) => {
          const r = rowOf(el);
          if (r !== null) setRun((s) => (s ? moveRunEnd(s, end, r) : s));
        }}
        onCut={() => take(true, true)}
        onCopy={() => take(true, false)}
        onDelete={() => take(false, true)}
        onClear={() => setRun(null)}
      />
    ) : null;

  return { run, onMouseDown, overlay };
}
