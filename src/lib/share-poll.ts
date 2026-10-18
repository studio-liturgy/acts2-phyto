/**
 * When the /g/<token> share viewer polls next.
 *
 * Each poll is a cheap change check (see lib/share-view.ts), but an open tab
 * still asks around the clock. So the viewer polls every 8 seconds while the
 * gathering is changing, eases off to once a minute after 30 quiet minutes
 * (the week between services), and stops entirely while the tab or phone
 * screen is hidden. Coming back into view polls at once.
 */

/** Poll interval while the gathering has changed recently. */
export const ACTIVE_POLL_MS = 8_000;
/** Poll interval once nothing has changed for IDLE_AFTER_MS. */
export const IDLE_POLL_MS = 60_000;
/** Quiet time before polling eases off to IDLE_POLL_MS. */
export const IDLE_AFTER_MS = 30 * 60 * 1000;

/** Delay before the next poll, given when the view last changed. */
export function nextPollDelay(lastChangeAt: number, now: number = Date.now()): number {
  return now - lastChangeAt >= IDLE_AFTER_MS ? IDLE_POLL_MS : ACTIVE_POLL_MS;
}
