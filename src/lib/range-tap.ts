// Touch handling for the app's range sliders (TapRange). iOS only moves a
// native range when the drag starts on its thumb, and our track is 1px, so a
// tap on the bar did nothing. These are the pure decisions behind TapRange.

/** Thumb width in styles.css: the native range maps the thumb's CENTRE from
 *  half a thumb in from each end, so a tap lands where the thumb would. */
export const RANGE_THUMB_PX = 12;

/** The slider value under a finger at `clientX` on a slider box starting at
 *  `left` and `width` wide, clamped and snapped to `step`. */
export function rangeValueAt(
  clientX: number,
  left: number,
  width: number,
  min: number,
  max: number,
  step: number,
): number {
  const usable = Math.max(1, width - RANGE_THUMB_PX);
  const ratio = Math.min(1, Math.max(0, (clientX - left - RANGE_THUMB_PX / 2) / usable));
  const raw = min + ratio * (max - min);
  const snapped = step > 0 ? min + Math.round((raw - min) / step) * step : raw;
  // Float steps (0.05) drift: round to the step's own decimals.
  const decimals = (String(step).split(".")[1] ?? "").length;
  return Math.min(max, Math.max(min, Number(snapped.toFixed(decimals))));
}

/** Finger travel (px) before a touch counts as a drag rather than a tap. */
export const RANGE_DRAG_PX = 6;

export type RangeGesture = "pending" | "drag" | "scroll";

/** What a touch that started at (x0, y0) and is now at (x, y) is doing: a
 *  sideways move drags the slider, an up/down move is the page scrolling (the
 *  slider stays put), and a small move is still undecided (a tap so far). */
export function rangeGesture(x0: number, y0: number, x: number, y: number): RangeGesture {
  const dx = Math.abs(x - x0);
  const dy = Math.abs(y - y0);
  if (dx < RANGE_DRAG_PX && dy < RANGE_DRAG_PX) return "pending";
  return dx >= dy ? "drag" : "scroll";
}
