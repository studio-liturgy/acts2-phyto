// Account/group-level share slugs. The public URL /g/<slug> belongs to an
// ACCOUNT (personal) or a GROUP, not a single gathering, and resolves to whatever
// gathering is live in that scope. This module owns the authenticated read/write
// side (the viewer resolves slugs itself, anon). It talks to Supabase directly —
// account-level state, deliberately kept OUT of the Dexie sync engine.

import { supabase } from "./supabase";
import { useAuthStore } from "./authStore";
import { nanoid } from "nanoid";
import { normalizeSlug, validateSlug, type SlugError } from "./slug";

/** A slug scope: a group (by id) or the caller's personal account (groupId null). */
export type SlugScope = { groupId: string | null };

export type SetSlugResult = { ok: true } | { ok: false; reason: SlugError | "taken" | "offline" };

type ScopeRow = { user_id: string | null; group_id: string | null };

/** An account_slugs INSERT payload. Both scope columns are optional so the same
 *  shape covers personal and group rows (the one-scope CHECK enforces exactly one
 *  at the DB). Typed explicitly so a union literal doesn't trip PostgREST's insert
 *  inference. */
type SlugInsert = { slug: string; is_current: boolean; user_id?: string; group_id?: string };

function slugInsert(scope: SlugScope, userId: string, slug: string): SlugInsert {
  return scope.groupId
    ? { slug, group_id: scope.groupId, is_current: true }
    : { slug, user_id: userId, is_current: true };
}

function currentUserId(): string | null {
  return useAuthStore.getState().session?.user.id ?? null;
}

/** Does a stored slug row belong to this scope? Personal rows are keyed by the
 *  caller's user_id with no group; group rows by group_id. */
function rowMatchesScope(row: ScopeRow, scope: SlugScope, userId: string): boolean {
  return scope.groupId ? row.group_id === scope.groupId : row.user_id === userId && !row.group_id;
}

/** Narrow a gatherings/account_slugs query to a scope. */
function scopeFilter<T extends { eq: (c: string, v: unknown) => T; is: (c: string, v: null) => T }>(
  q: T,
  scope: SlugScope,
  userId: string,
): T {
  return scope.groupId
    ? q.eq("group_id", scope.groupId)
    : q.eq("user_id", userId).is("group_id", null);
}

/** The scope's active slug, or null if none is set (or signed out / table absent).
 *  Best-effort: any error (including the table not existing pre-migration) is
 *  swallowed so callers fall back to the gathering's own share_token. */
export async function fetchCurrentSlug(scope: SlugScope): Promise<string | null> {
  const userId = currentUserId();
  if (!userId) return null;
  const base = supabase.from("account_slugs").select("slug").eq("is_current", true);
  const { data, error } = await scopeFilter(base, scope, userId).limit(1).maybeSingle();
  if (error || !data) return null;
  return (data.slug as string) ?? null;
}

/** The scope's active slug, provisioning a default from `seed` if none exists yet
 *  — so a persistent per-account URL is in place the first time it's needed. The
 *  seed is normally the primary gathering's share_token, which keeps any link
 *  already handed out working. Returns null when signed out or the table is
 *  missing (migration not applied), signalling the caller to fall back. */
export async function ensureSlug(scope: SlugScope, seed: string): Promise<string | null> {
  const userId = currentUserId();
  if (!userId) return null;

  const existing = await fetchCurrentSlug(scope);
  if (existing) return existing;

  // Seed from the gathering token when it is a usable slug, else a fresh id.
  const seedNorm = normalizeSlug(seed);
  let candidate = validateSlug(seedNorm).ok ? seedNorm : nanoid(10);

  // Two attempts: the seed may already be claimed by another scope; fall back to
  // a random id. If even that races, give up and let the caller fall back.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await supabase
      .from("account_slugs")
      .insert(slugInsert(scope, userId, candidate));
    if (!error) return candidate;
    if (error.code !== "23505") return null; // not a collision (e.g. table absent)
    candidate = nanoid(10);
  }
  return null;
}

/** Set the scope's slug. Validates, checks the slug isn't held by ANOTHER scope,
 *  retires the previous slug (kept as an alias so old links still resolve), and
 *  activates the new one. */
export async function setSlug(scope: SlugScope, rawSlug: string): Promise<SetSlugResult> {
  const userId = currentUserId();
  if (!userId) return { ok: false, reason: "offline" };

  const slug = normalizeSlug(rawSlug);
  const check = validateSlug(slug);
  if (!check.ok) return check;

  // Who, if anyone, already holds this slug?
  const { data: holder, error: holderErr } = await supabase
    .from("account_slugs")
    .select("user_id, group_id, is_current")
    .eq("slug", slug)
    .maybeSingle();
  if (holderErr) {
    console.error("[account-slug] holder check failed:", holderErr);
    return { ok: false, reason: "offline" };
  }
  if (holder) {
    if (!rowMatchesScope(holder as ScopeRow, scope, userId)) return { ok: false, reason: "taken" };
    if ((holder as { is_current: boolean }).is_current) return { ok: true }; // already current
  }

  // Retire the scope's current slug(s) so the partial-unique index admits the new
  // one. Retired rows stay as aliases and keep resolving.
  const retire = supabase
    .from("account_slugs")
    .update({ is_current: false })
    .eq("is_current", true);
  const { error: retireErr } = await scopeFilter(retire, scope, userId).neq("slug", slug);
  if (retireErr) {
    console.error("[account-slug] retire failed:", retireErr);
    return { ok: false, reason: "offline" };
  }

  // Reactivate an existing (retired, same-scope) row, or insert a fresh one.
  const write = holder
    ? supabase.from("account_slugs").update({ is_current: true }).eq("slug", slug)
    : supabase.from("account_slugs").insert(slugInsert(scope, userId, slug));
  const { error: writeErr } = await write;
  if (writeErr) {
    if (writeErr.code === "23505") return { ok: false, reason: "taken" };
    console.error("[account-slug] activate failed:", writeErr);
    return { ok: false, reason: "offline" };
  }
  return { ok: true };
}
