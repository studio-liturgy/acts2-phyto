/**
 * Where a pop-up dialog sits while the phone keyboard is up: centred in the
 * part of the screen the keyboard leaves visible, so its text box is never
 * under the keys. Null when no keyboard is covering the screen (the dialog
 * keeps its usual centre).
 */
export function dialogKeyboardBox({
  innerHeight,
  vvHeight,
  vvTop,
}: {
  innerHeight: number;
  vvHeight: number;
  vvTop: number;
}): { top: number; height: number } | null {
  // Less than this is browser chrome sliding, not a keyboard.
  if (innerHeight - vvHeight <= 80) return null;
  return { top: Math.round(vvTop), height: Math.round(vvHeight) };
}
