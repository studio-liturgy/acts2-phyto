// Caret helpers for the contentEditable cells (see components/RichText). All
// offsets are PLAIN-TEXT offsets: characters and line breaks, no markup.

/** Every leaf of a cell in order: text nodes, and <br>s (one character). */
function leaves(root: HTMLElement): Array<Text | HTMLBRElement> {
  const out: Array<Text | HTMLBRElement> = [];
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) out.push(n as Text);
    else if (n instanceof HTMLBRElement) out.push(n);
    else n.childNodes.forEach(walk);
  };
  walk(root);
  return out;
}

/** The plain-text length of a cell's content (a trailing <br> that only keeps
 *  the box open doesn't count, matching htmlToMarkup). */
export function plainTextLength(root: HTMLElement): number {
  const ls = leaves(root);
  let n = 0;
  for (const l of ls) n += l instanceof Text ? l.data.length : 1;
  if (ls.length && ls[ls.length - 1] instanceof HTMLBRElement) n -= 1;
  return n;
}

/** The plain offset of a point (node, offset) inside the cell: the leaves
 *  before it, measured with a range from the cell's start to the point. */
function offsetOf(root: HTMLElement, node: Node, offset: number): number {
  const upto = document.createRange();
  upto.setStart(root, 0);
  try {
    upto.setEnd(node, offset);
  } catch {
    return 0;
  }
  let n = 0;
  for (const l of leaves(root)) {
    if (l instanceof Text) {
      // Fully before the point, partly, or after.
      if (upto.comparePoint(l, l.data.length) <= 0) n += l.data.length;
      else if (upto.comparePoint(l, 0) <= 0) {
        n += node === l ? offset : 0;
        break;
      } else break;
    } else if (upto.comparePoint(l, 0) < 0) n += 1;
    else break;
  }
  return n;
}

/** Where the caret is (its focus end) as a plain offset, or null when the
 *  selection isn't in this cell. */
export function caretOffset(root: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.focusNode || !root.contains(sel.focusNode)) return null;
  return offsetOf(root, sel.focusNode, sel.focusOffset);
}

/** Is the selection a single point (nothing highlighted) inside the cell? */
export function isCollapsedIn(root: HTMLElement): boolean {
  const sel = window.getSelection();
  return !!sel && sel.rangeCount > 0 && sel.isCollapsed && root.contains(sel.anchorNode);
}

/** Put the caret at a plain offset (clamped; Infinity for the end). */
export function setCaret(root: HTMLElement, at: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let n = 0;
  let placed = false;
  for (const l of leaves(root)) {
    const len = l instanceof Text ? l.data.length : 1;
    if (at <= n + len) {
      if (l instanceof Text) range.setStart(l, Math.max(0, at - n));
      else {
        // Before or after the <br>.
        const parent = l.parentNode!;
        const idx = Array.from(parent.childNodes).indexOf(l);
        range.setStart(parent, at - n <= 0 ? idx : idx + 1);
      }
      placed = true;
      break;
    }
    n += len;
  }
  if (!placed) {
    // Past the end: after the last leaf (before a trailing <br> that only
    // keeps the box open).
    const ls = leaves(root);
    const last = ls[ls.length - 1];
    if (last instanceof Text) range.setStart(last, last.data.length);
    else if (last) {
      const parent = last.parentNode!;
      range.setStart(parent, Array.from(parent.childNodes).indexOf(last));
    } else range.setStart(root, 0);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Is the caret on the first (or last) visual line of the cell? Judged from
 *  the caret's rectangle against the cell's padding box, so wrapped lines
 *  count; falls back to the offset when the caret has no rectangle. */
export function caretOnEdgeLine(root: HTMLElement, edge: "first" | "last"): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return true;
  const at = caretOffset(root);
  if (at === null) return true;
  const len = plainTextLength(root);
  if (edge === "first" && at === 0) return true;
  if (edge === "last" && at >= len) return true;
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(edge === "first");
  let rect = range.getBoundingClientRect();
  if (rect.height === 0) {
    // A collapsed range at an element boundary can have no box; measure the
    // nearest text instead.
    const rects = range.getClientRects();
    if (rects.length) rect = rects[0];
    else return edge === "first" ? at === 0 : at >= len;
  }
  const box = root.getBoundingClientRect();
  const cs = getComputedStyle(root);
  const line = parseFloat(cs.lineHeight) || rect.height || 16;
  if (edge === "first") return rect.top < box.top + parseFloat(cs.paddingTop) + line * 0.75;
  return rect.bottom > box.bottom - parseFloat(cs.paddingBottom) - line * 0.75;
}

/** The cells of the enclosing editor (an ancestor marked data-rich-cells), in
 *  document order. */
export function siblingCells(cell: HTMLElement): HTMLElement[] {
  const scope = cell.closest("[data-rich-cells]") ?? document.body;
  return Array.from(scope.querySelectorAll<HTMLElement>("[data-rich-cell]"));
}

/**
 * The cell the arrow keys move to from `cell`: the next (or previous) cell in
 * the same column. A cell with no column (a point, a quote) is in every
 * column; from one of those, the first column is taken.
 */
export function neighbourCell(cell: HTMLElement, dir: -1 | 1): HTMLElement | null {
  const all = siblingCells(cell);
  const i = all.indexOf(cell);
  if (i === -1) return null;
  const col = cell.dataset.col ?? "";
  for (let j = i + dir; j >= 0 && j < all.length; j += dir) {
    const c = all[j];
    const ccol = c.dataset.col ?? "";
    if (!ccol || ccol === col || (!col && c.dataset.colFirst === "true")) return c;
  }
  return null;
}

/** Focus a cell (found by its data-rich-cell id within `scope`) with the caret
 *  at a plain offset. Runs after the next paint so a fresh cell exists. */
export function focusCell(scope: HTMLElement | null | undefined, id: string, at: number): void {
  requestAnimationFrame(() => {
    const root = scope ?? document.body;
    const el = Array.from(root.querySelectorAll<HTMLElement>("[data-rich-cell]")).find(
      (c) => c.dataset.richCell === id,
    );
    if (!el) return;
    el.focus();
    setCaret(el, at);
  });
}
