/**
 * Live-session expiry.
 *
 * A gathering goes live and stays live until the presenter ends it — except
 * presenters routinely just close the laptop when a service finishes. Those
 * gatherings used to stay `is_live` forever, and every viewer tab still open on
 * the share link kept re-fetching each set's full `content` (inline base64
 * images, sometimes megabytes) every 8 seconds, indefinitely. That was the
 * dominant source of Supabase egress.
 *
 * So a live session now auto-expires 24 hours after it started. No real service
 * runs longer, and the presenter can always go live again.
 *
 * The server is the enforcement point: `gatherings.live_started_at` is stamped
 * by a trigger, and the public `gathering_sets` RLS policy hides sets once the
 * window has elapsed (see schema.sql). The helpers here are the client-side
 * mirror of that rule, so viewers stop polling rather than politely asking for
 * rows the server will refuse.
 */

/** How long a gathering stays live before it auto-ends.
 *  MIRRORED IN SQL as `interval '24 hours'` in the public `gathering_sets`
 *  policy in schema.sql — change both together. */
export const LIVE_SESSION_MS = 24 * 60 * 60 * 1000;

/** The live-session fields of a gathering, as stored locally. */
export interface LiveWindow {
  is_live: boolean | null;
  live_started_at: number | null;
}

/** When this gathering's live session auto-ends, or `null` if it is not live.
 *  A live row with no `live_started_at` has no known window and is treated as
 *  expired: that is the fail-closed case for legacy rows written before the
 *  column existed. */
export function liveExpiresAt(g: LiveWindow | null | undefined): number | null {
  if (!g?.is_live || g.live_started_at == null) return null;
  return g.live_started_at + LIVE_SESSION_MS;
}

/** Whether a gathering is live *right now*: the server flag is set AND the 24h
 *  window has not elapsed. Prefer this over reading `is_live` directly — a
 *  session that was never manually ended keeps `is_live` true forever. */
export function isLiveNow(g: LiveWindow | null | undefined, now: number = Date.now()): boolean {
  const expiresAt = liveExpiresAt(g);
  return expiresAt !== null && now < expiresAt;
}

/** Milliseconds until this gathering auto-ends, floored at 0. `null` when it is
 *  not live. */
export function liveMsRemaining(
  g: LiveWindow | null | undefined,
  now: number = Date.now(),
): number | null {
  const expiresAt = liveExpiresAt(g);
  return expiresAt === null ? null : Math.max(0, expiresAt - now);
}
