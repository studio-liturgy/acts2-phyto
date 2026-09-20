import { useCallback, useEffect, useRef } from "react";
import { caretOffset, focusCell } from "@/lib/rich-caret";

/** Where the caret was when a change was made, so undoing it puts the caret
 *  back: a cell id (data-rich-cell) and a plain offset. */
export interface CaretSpot {
  cell: string;
  at: number;
}

interface Entry<T> {
  value: T;
  caret: CaretSpot | null;
}

/** Typing into the same cell within this window is one undo step. */
const COALESCE_MS = 1000;

/**
 * Undo / redo over an editor's model: the verse text of the scripture editor,
 * a message's slides. `record(caret, key)` is called BEFORE a change with the
 * caret's position; it snapshots the current value. Consecutive records with
 * the same `key` inside a second (keystrokes into one cell) are one step.
 * Changes that arrive without a record (a collaborator's edit, a re-seed) are
 * pushed as steps too, so undo always returns to what was on screen.
 *
 * `apply` puts a value back; the caret is then restored via `scope` (the
 * editor's root element, marked data-rich-cells).
 */
export function useUndo<T>({
  value,
  apply,
  scope,
  equals = Object.is,
}: {
  value: T;
  apply: (value: T) => void;
  scope: React.RefObject<HTMLElement | null>;
  /** When the model is rebuilt each render (a fresh record), how to tell it
   *  hasn't actually changed. */
  equals?: (a: T, b: T) => boolean;
}) {
  const past = useRef<Entry<T>[]>([]);
  const future = useRef<Entry<T>[]>([]);
  const lastSeen = useRef<T>(value);
  const own = useRef(false);
  const lastKey = useRef<string | null>(null);
  const lastAt = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;

  // A change we didn't record ourselves becomes a step of its own.
  useEffect(() => {
    if (equals(value, lastSeen.current)) return;
    if (!own.current) {
      past.current.push({ value: lastSeen.current, caret: null });
      future.current = [];
      lastKey.current = null;
    }
    own.current = false;
    lastSeen.current = value;
  }, [value, equals]);

  const record = useCallback((caret: CaretSpot | null, key?: string) => {
    const now = Date.now();
    const coalesce = !!key && key === lastKey.current && now - lastAt.current < COALESCE_MS;
    lastKey.current = key ?? null;
    lastAt.current = now;
    own.current = true;
    future.current = [];
    if (coalesce) return;
    past.current.push({ value: valueRef.current, caret });
    if (past.current.length > 200) past.current.shift();
  }, []);

  const step = useCallback(
    (from: Entry<T>[], to: Entry<T>[], caretNow: CaretSpot | null) => {
      const entry = from.pop();
      if (!entry) return;
      to.push({ value: valueRef.current, caret: caretNow });
      lastKey.current = null;
      own.current = true;
      lastSeen.current = entry.value;
      apply(entry.value);
      if (entry.caret) focusCell(scope.current, entry.caret.cell, entry.caret.at);
    },
    [apply, scope],
  );

  const undo = useCallback(
    (caretNow: CaretSpot | null) => step(past.current, future.current, caretNow),
    [step],
  );
  const redo = useCallback(
    (caretNow: CaretSpot | null) => step(future.current, past.current, caretNow),
    [step],
  );

  /** Cmd/Ctrl+Z undoes, with Shift (or Cmd/Ctrl+Y) redoes. True when handled. */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent, caretNow: () => CaretSpot | null) => {
      if (!(e.metaKey || e.ctrlKey)) return false;
      const k = e.key.toLowerCase();
      if (k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(caretNow());
        else undo(caretNow());
        return true;
      }
      if (k === "y") {
        e.preventDefault();
        redo(caretNow());
        return true;
      }
      return false;
    },
    [undo, redo],
  );

  return { record, undo, redo, onKeyDown };
}

/** The focused cell and caret, for recording, from the editor's scope. */
export function currentCaret(scope: HTMLElement | null | undefined): CaretSpot | null {
  const el = document.activeElement as HTMLElement | null;
  if (!el || !el.dataset.richCell || (scope && !scope.contains(el))) return null;
  return { cell: el.dataset.richCell, at: caretOffset(el) ?? 0 };
}
