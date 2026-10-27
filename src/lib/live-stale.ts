/**
 * The presenter forgets its selected slide after a long break: opened 8 hours
 * or more after the slide last changed, it starts with nothing selected (and a
 * blank output) instead of where the last service left it. A service never
 * goes 8 hours without a slide change, so it can't clear one mid-service.
 */
export const LIVE_STALE_MS = 8 * 60 * 60 * 1000;

/** When the slide last changed (epoch ms), or null if never recorded. */
export function liveIsStale(changedAt: number | null, now: number): boolean {
  return changedAt !== null && now - changedAt >= LIVE_STALE_MS;
}
