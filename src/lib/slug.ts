// Custom gathering-URL slugs. A gathering is shared at `/g/<share_token>`, and
// share_token doubles as the slug: it is globally unique (gatherings_share_token_key)
// and URL-addressable already, so a user-chosen slug is just a share_token the
// owner picked instead of the default nanoid(10). The slug lives UNDER `/g/`, so
// it can never shadow a top-level route — validation only has to keep it
// URL-safe, a sensible length, and clear of a few reserved words.

export const SLUG_MIN = 3;
export const SLUG_MAX = 32;

/** Words we keep out of slugs to avoid confusing or abusive links. The slug is
 *  namespaced under /g/ so this is not about route collisions — just hygiene. */
const RESERVED = new Set(["new", "edit", "admin", "api", "null", "undefined"]);

export type SlugError = "too-short" | "too-long" | "invalid-chars" | "reserved";

export type SlugCheck = { ok: true } | { ok: false; reason: SlugError };

/** Coerce free-typed input toward a valid slug: lowercase, spaces/underscores to
 *  hyphens, drop anything outside [a-z0-9-], collapse and trim hyphens. Does NOT
 *  enforce length — that is validateSlug's job, so the caller can show a
 *  "too short" hint while the user is still typing. */
export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Validate an ALREADY-normalized slug. Callers normalize first, then validate,
 *  so the two never disagree about what the final slug would be. */
export function validateSlug(slug: string): SlugCheck {
  if (slug.length < SLUG_MIN) return { ok: false, reason: "too-short" };
  if (slug.length > SLUG_MAX) return { ok: false, reason: "too-long" };
  // Guard against any char the normalizer would have stripped, plus leading/
  // trailing/double hyphens — a defensive re-check so a hand-built slug that
  // skipped normalizeSlug still can't slip through.
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return { ok: false, reason: "invalid-chars" };
  if (RESERVED.has(slug)) return { ok: false, reason: "reserved" };
  return { ok: true };
}

/** Human-readable message for a slug error, for inline form feedback. */
export function slugErrorMessage(reason: SlugError): string {
  switch (reason) {
    case "too-short":
      return `Use at least ${SLUG_MIN} characters.`;
    case "too-long":
      return `Keep it under ${SLUG_MAX} characters.`;
    case "invalid-chars":
      return "Use letters, numbers, and hyphens only.";
    case "reserved":
      return "That word is reserved. Try another.";
  }
}
