import { useLayoutEffect, useRef } from "react";
import { htmlToMarkup, markupToHtml } from "@/lib/inline-format";
import {
  caretOffset,
  caretOnEdgeLine,
  isCollapsedIn,
  neighbourCell,
  plainTextLength,
  setCaret,
} from "@/lib/rich-caret";

/** The keys, seen from a cell's key handler: where the caret is, so the
 *  editors can decide about Backspace at the start, Cmd+Enter, and so on. */
export interface CellKeyEvent {
  e: React.KeyboardEvent<HTMLDivElement>;
  el: HTMLDivElement;
  /** Plain-text caret offset (markup doesn't count). */
  at: number;
  length: number;
  collapsed: boolean;
}

/**
 * A rich-text cell: bold, italic and underline are applied in the DOM
 * (Cmd/Ctrl+B/I/U), so the user sees the formatting rather than markers, and
 * the DOM is serialised to canonical markup (lib/inline-format) on every edit.
 * Auto-grows like a textarea; no scrollbars. Paste is plain text.
 *
 * The cell is uncontrolled while it has the focus: its HTML is rewritten from
 * `value` only when the two disagree (an undo, a merge, a re-seed), which is
 * what keeps the caret where it is during typing.
 *
 * `cellId` and `col` mark it for the arrow keys (up/down move to the same
 * column's neighbouring cell when the caret is on the first/last line) and
 * for undo, which needs to find a cell again to put the caret back.
 */
export function RichText({
  value,
  onChange,
  placeholder,
  className = FIELD,
  cellId,
  col,
  colFirst,
  singleLine = false,
  disabled = false,
  selected,
  data,
  onMouseDown,
  onFocus,
  onCaret,
  onKeyDown,
  arrows = true,
}: {
  value: string;
  onChange: (markup: string) => void;
  placeholder?: string;
  className?: string;
  cellId?: string;
  /** The version (column) this cell belongs to; none for a single column. */
  col?: string;
  colFirst?: boolean;
  /** Enter does nothing (a heading, an attribution). */
  singleLine?: boolean;
  disabled?: boolean;
  selected?: boolean;
  data?: Record<string, string | number>;
  onMouseDown?: () => void;
  onFocus?: (at: number) => void;
  /** The caret moved: its plain offset. */
  onCaret?: (at: number) => void;
  /** Editor-specific keys; return true when handled. */
  onKeyDown?: (k: CellKeyEvent) => boolean | void;
  /** Up/down (and left/right at the ends) move between cells. */
  arrows?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (htmlToMarkup(el) !== value) {
      const at = document.activeElement === el ? caretOffset(el) : null;
      el.innerHTML = markupToHtml(value);
      if (at !== null) setCaret(el, at);
    }
  }, [value]);

  const report = () => {
    const el = ref.current;
    if (!el) return;
    const at = caretOffset(el);
    if (at !== null) onCaret?.(at);
  };

  const move = (dir: -1 | 1, at: "start" | "end") => {
    const el = ref.current;
    if (!el) return false;
    const next = neighbourCell(el, dir);
    if (!next) return false;
    next.focus();
    setCaret(next, at === "start" ? 0 : Infinity);
    return true;
  };

  return (
    <div className="relative">
      {!value && placeholder && (
        <div aria-hidden className={`${className} pointer-events-none absolute inset-0 opacity-40`}>
          {placeholder}
        </div>
      )}
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline={!singleLine}
        tabIndex={disabled ? -1 : 0}
        data-rich-cell={cellId}
        data-col={col}
        data-col-first={colFirst ? "true" : undefined}
        onInput={(e) => {
          onChange(htmlToMarkup(e.currentTarget));
          report();
        }}
        onMouseDown={onMouseDown}
        onMouseUp={report}
        onFocus={(e) => onFocus?.(caretOffset(e.currentTarget) ?? 0)}
        onKeyUp={report}
        onPaste={(e) => {
          e.preventDefault();
          let text = e.clipboardData.getData("text/plain");
          if (singleLine) text = text.replace(/\s*\n\s*/g, " ");
          document.execCommand("insertText", false, text);
        }}
        onKeyDown={(e) => {
          const el = e.currentTarget;
          const mod = e.metaKey || e.ctrlKey;
          if (mod && !e.shiftKey && !e.altKey) {
            const k = e.key.toLowerCase();
            const cmd = k === "b" ? "bold" : k === "i" ? "italic" : k === "u" ? "underline" : null;
            if (cmd) {
              e.preventDefault();
              document.execCommand(cmd);
              return;
            }
          }
          const at = caretOffset(el) ?? 0;
          const length = plainTextLength(el);
          const collapsed = isCollapsedIn(el);
          if (onKeyDown?.({ e, el, at, length, collapsed })) return;
          if (e.defaultPrevented) return;
          if (e.key === "Enter") {
            if (mod || singleLine) {
              e.preventDefault();
              return;
            }
            // Always a <br>, never a browser-chosen <div>.
            e.preventDefault();
            document.execCommand("insertLineBreak");
            return;
          }
          if (!arrows || mod || e.shiftKey || e.altKey) return;
          if (e.key === "ArrowUp" && caretOnEdgeLine(el, "first")) {
            if (move(-1, "end")) e.preventDefault();
          } else if (e.key === "ArrowDown" && caretOnEdgeLine(el, "last")) {
            if (move(1, "start")) e.preventDefault();
          } else if (e.key === "ArrowLeft" && collapsed && at === 0) {
            if (move(-1, "end")) e.preventDefault();
          } else if (e.key === "ArrowRight" && collapsed && at >= length) {
            if (move(1, "start")) e.preventDefault();
          }
        }}
        className={`${className} whitespace-pre-wrap break-words ${disabled ? "opacity-40" : ""}`}
        style={{
          ...(selected
            ? { backgroundColor: "color-mix(in oklab, var(--foreground) 18%, transparent)" }
            : undefined),
          ...(singleLine ? { whiteSpace: "pre" } : undefined),
        }}
        {...data}
      />
    </div>
  );
}

/** A borderless field matching the verse cells. */
export const FIELD = "mono w-full min-w-0 bg-transparent px-3 py-2 text-xs outline-none";
