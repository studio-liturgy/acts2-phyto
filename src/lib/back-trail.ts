/**
 * Back on the info pages (About, Updates, Terms, Privacy, Transparency,
 * Feedback, Donate) returns to the page it was opened from when that is one
 * of them or the Intro, instead of always going home.
 *
 * The router numbers each history entry (`__TSR_index` in history.state).
 * The root records which page sits at each number for this tab
 * (sessionStorage), so a page can tell what is one step behind it. Stepping
 * back only ever goes to an entry this site recorded, so it never leaves it.
 */

const KEY = "phyto:back-trail";
/** Only the most recent entries matter. */
const KEEP = 50;

type Trail = Record<string, string>;

const STEP_BACK_PATHS = new Set([
  "/about",
  "/updates",
  "/terms",
  "/privacy",
  "/transparency",
  "/feedback",
  "/donate",
]);

/** A page Back should step back to: an info page, or the Intro ("/?intro"). */
export function isStepBackPage(href: string): boolean {
  const url = new URL(href, "https://phyto.live");
  if (STEP_BACK_PATHS.has(url.pathname)) return true;
  if (url.pathname !== "/") return false;
  const intro = url.searchParams.get("intro");
  return intro === "true" || intro === "1";
}

/** Adds `href` at `index`, keeping only the newest entries. */
export function withEntry(trail: Trail, index: number, href: string): Trail {
  const next: Trail = { ...trail, [String(index)]: href };
  for (const k of Object.keys(next)) {
    if (Number(k) <= index - KEEP || Number(k) > index) delete next[k];
  }
  return next;
}

/** Where Back should step back to from the entry at `index`, or null. */
export function stepBackHref(trail: Trail, index: number, currentHref: string): string | null {
  if (index < 1) return null;
  const prev = trail[String(index - 1)];
  if (!prev || !isStepBackPage(prev)) return null;
  // The same page (a re-render or a replaced entry): nothing to step back to.
  if (
    new URL(prev, "https://phyto.live").pathname ===
    new URL(currentHref, "https://phyto.live").pathname
  )
    return null;
  return prev;
}

function readTrail(): Trail {
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Trail) : {};
  } catch {
    return {};
  }
}

/** The router's number for a history entry (its location state), or null. */
export function entryIndex(state: unknown): number | null {
  const i = (state as { __TSR_index?: unknown } | null)?.__TSR_index;
  return typeof i === "number" ? i : null;
}

/** Records the entry at `index` (the root calls it on every location change). */
export function recordBackTrail(index: number | null, href: string): void {
  if (typeof window === "undefined" || index === null) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(withEntry(readTrail(), index, href)));
  } catch {
    // Storage unavailable: Back goes home as before.
  }
}

/** Where Back on the entry at `index` should step back to, or null (client only). */
export function currentStepBackHref(index: number | null, href: string): string | null {
  if (typeof window === "undefined" || index === null) return null;
  return stepBackHref(readTrail(), index, href);
}
