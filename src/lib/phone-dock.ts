// The phone editors' dock (PhoneDock in components/phone/PhoneChrome).

/** A button in the PhoneDock. */
export const PHONE_DOCK_ICON =
  "pill flex h-9 w-9 shrink-0 items-center justify-center transition active:bg-foreground/15 disabled:opacity-40";

/** After adding to the end of a set from the dock: scroll the editor to the
 *  bottom so the new line, section or point is in view (once it's rendered). */
export function scrollEditorToEnd(): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(".has-dock [data-editor-scroll]");
      el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }),
  );
}

/** On a dock button: the tap doesn't take focus, so the keyboard stays up. */
export const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();

/**
 * Tapping a line in a phone editor: how far to scroll the editor first so the
 * line sits above where the keyboard will be (0 when it already does). A line
 * that would be covered goes to the top of the editor, so iOS finds nothing to
 * reveal and doesn't slide the page (the jump down and back on every tap).
 * `keyboard` is the keyboard's height (0 when it's already up: the screen
 * then ends at it), `dock` the tools tab sitting on it.
 */
export function revealDelta(
  line: { top: number; bottom: number },
  editorTop: number,
  screenHeight: number,
  keyboard: number,
  dock = 56,
): number {
  const visibleBottom = screenHeight - keyboard - dock;
  if (line.bottom <= visibleBottom) return 0;
  return line.top - (editorTop + 8);
}

/**
 * The caret position in a text box under a screen point, by laying an
 * invisible copy of the box (same font, padding, width and wrapping) over it
 * and asking the browser which character is there. Falls back to the end.
 */
export function caretAtPoint(
  el: HTMLTextAreaElement | HTMLInputElement,
  x: number,
  y: number,
): number {
  const end = el.value.length;
  const doc = el.ownerDocument;
  const at = (
    doc as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    }
  ).caretRangeFromPoint;
  if (typeof at !== "function") return end;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const m = doc.createElement("div");
  for (const k of [
    "fontFamily",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "letterSpacing",
    "lineHeight",
    "textTransform",
    "textIndent",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "boxSizing",
    "textAlign",
    "direction",
    "tabSize",
  ] as const) {
    m.style[k] = cs[k];
  }
  const wraps = el instanceof HTMLTextAreaElement && el.wrap !== "off";
  Object.assign(m.style, {
    position: "fixed",
    left: `${r.left}px`,
    top: `${r.top - el.scrollTop}px`,
    width: `${r.width}px`,
    margin: "0",
    borderStyle: "solid",
    borderColor: "transparent",
    whiteSpace: wraps ? "pre-wrap" : "pre",
    overflowWrap: wraps ? "break-word" : "normal",
    opacity: "0",
    zIndex: "2147483647",
    pointerEvents: "auto",
  });
  m.textContent = el.value;
  doc.body.appendChild(m);
  try {
    const range = at.call(doc, x + (wraps ? 0 : el.scrollLeft), y);
    if (!range || !m.contains(range.startContainer)) return end;
    return Math.min(range.startOffset, end);
  } finally {
    m.remove();
  }
}
