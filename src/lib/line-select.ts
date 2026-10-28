/** A run of whole lines picked on a phone (by press-and-hold, then handles). */
export type LineRun = { from: number; to: number };

/**
 * Drag one end of a line run to `row`. The other end stays put; dragging an
 * end past the other one flips the run rather than emptying it.
 */
export function moveRunEnd(run: LineRun, end: "start" | "end", row: number): LineRun {
  const fixed = end === "start" ? run.to : run.from;
  return { from: Math.min(fixed, row), to: Math.max(fixed, row) };
}

/** From the line held down (`anchor`) to the line under the finger. */
export function runFrom(anchor: number, row: number): LineRun {
  return { from: Math.min(anchor, row), to: Math.max(anchor, row) };
}

// Shared with the editors' tap handler (PhoneChrome useKeyboardInset): while
// a press-and-hold line pick is under way, the lift of that finger is not a
// tap on the line.
export const lineHold = { active: false };

/**
 * How long a finger must stay still on a line to pick it, read when the
 * touch starts. Longer while a line is being typed in: moving between lines
 * with the keyboard up is all taps, and an unhurried tap (around half a
 * second) used to drop the keyboard and pick the line. Anything shorter is a
 * tap (PhoneChrome uses the same figure).
 */
export function holdDelay(): number {
  const a = typeof document !== "undefined" ? document.activeElement : null;
  return a instanceof HTMLTextAreaElement || a instanceof HTMLInputElement ? 700 : 500;
}

/** Put text on the clipboard (from a tap, which iOS requires). */
export function copyText(text: string): void {
  void navigator.clipboard?.writeText(text).catch(() => {});
}
