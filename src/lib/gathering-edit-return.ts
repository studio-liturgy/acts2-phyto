// A gathering in edit mode on the home page sends you into one of its sets
// (the pencil beside each set's x). Coming back, the same gathering opens in
// edit mode again. Kept in sessionStorage: per tab, and read once.

const KEY = "phyto:reopen-gathering-edit";

/** Remember that this gathering was being edited when one of its sets opened. */
export function markGatheringEditReturn(gatheringId: string): void {
  try {
    sessionStorage.setItem(KEY, gatheringId);
  } catch {
    // Storage unavailable: the gathering just comes back out of edit mode.
  }
}

/** The gathering to reopen in edit mode, if any; cleared once read. */
export function takeGatheringEditReturn(): string | null {
  try {
    const id = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return id || null;
  } catch {
    return null;
  }
}
