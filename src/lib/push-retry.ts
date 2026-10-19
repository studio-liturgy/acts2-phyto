/** Delay before the next background push after `failures` failed pushes in a
 *  row. 0 failures is the normal debounce; each failure doubles it, capped at
 *  a minute, so a push that keeps failing (offline, or a write the server
 *  will always refuse) can't hammer the database twice a second. */
export const PUSH_DEBOUNCE_MS = 500;
export const PUSH_RETRY_MAX_MS = 60_000;

export function pushRetryDelay(failures: number): number {
  if (failures <= 0) return PUSH_DEBOUNCE_MS;
  return Math.min(PUSH_DEBOUNCE_MS * 2 ** failures, PUSH_RETRY_MAX_MS);
}
