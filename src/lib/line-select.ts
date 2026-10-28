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

/** Put text on the clipboard (from a tap, which iOS requires). */
export function copyText(text: string): void {
  void navigator.clipboard?.writeText(text).catch(() => {});
}
