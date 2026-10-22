import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  ensureSlug,
  fetchCurrentSlug,
  setSlug,
  type SetSlugResult,
  type SlugScope,
} from "@/lib/account-slug";
import { normalizeSlug } from "@/lib/slug";
import { useAuthStore } from "@/lib/authStore";
import { useLibrary } from "@/lib/store";

// One shared copy of each scope's slug for the whole page, so every share
// surface (the gathering cards, the Gatherings title's Share, the presenter)
// reads the same answer, and it is read once, in the background, as soon as
// the page knows who is signed in. Opening a dialog then shows the link at
// once instead of a blank second.
type Entry = { slug: string | null; resolved: boolean; provisioned: boolean };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const EMPTY: Entry = { slug: null, resolved: false, provisioned: false };

const keyOf = (userId: string, groupId: string | null) => `${userId}:${groupId ?? "personal"}`;
function put(key: string, entry: Entry) {
  cache.set(key, entry);
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Read the scope's slug (no writes). Once per scope per page. */
function prefetch(key: string, scope: SlugScope) {
  if (cache.get(key)?.resolved || inflight.has(key)) return;
  const p = fetchCurrentSlug(scope)
    .then((slug) => put(key, { slug, resolved: true, provisioned: !!slug }))
    .catch(() => {})
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
}

/** Make sure the scope has a slug, creating one the first time a share
 *  dialog opens (as before). Once per scope per page. */
function provision(key: string, scope: SlugScope, seed: string) {
  const cur = cache.get(key);
  if (cur?.provisioned) return;
  const run = async () => {
    await inflight.get(key);
    if (cache.get(key)?.provisioned) return;
    const slug = await ensureSlug(scope, seed);
    put(key, { slug, resolved: true, provisioned: true });
  };
  const p = run()
    .catch(() => put(key, { slug: null, resolved: true, provisioned: true }))
    .finally(() => {
      if (inflight.get(key) === p) inflight.delete(key);
    });
  inflight.set(key, p);
}

/**
 * Drives the share dialog's custom URL for a scope (personal or a group). The
 * slug is read in the background from the start; when `enabled` (the dialog
 * is open) a first slug is created if the scope has none. Returns the
 * effective slug to show and a save handler.
 *
 * `slug` is EMPTY until the account slug resolves, then becomes the resolved slug
 * — never the seed while loading. That avoids the flash where the URL showed the
 * gathering's own random token for half a second before snapping to the custom
 * one. Only once resolution finishes with no account slug (signed out, or the
 * migration isn't applied) does it fall back to the seed as a plain read-only
 * link. `canCustomize` is false in that fallback case, and false for a group
 * whose owner isn't me: only the group's owner may write its slug (RLS), so a
 * member would otherwise be offered an editor whose save can only fail.
 */
export function useAccountSlug({
  scope,
  seed,
  enabled,
}: {
  scope: SlugScope;
  seed: string;
  enabled: boolean;
}): {
  slug: string;
  canCustomize: boolean;
  ready: boolean;
  save: (slug: string) => Promise<SetSlugResult>;
} {
  const groupId = scope.groupId;
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const groups = useLibrary((s) => s.groups);
  const ownsScope = !groupId || groups.some((g) => g.id === groupId && g.owner_id === userId);
  const key = userId ? keyOf(userId, groupId) : null;
  const entry = useSyncExternalStore(
    subscribe,
    () => (key ? (cache.get(key) ?? EMPTY) : EMPTY),
    () => EMPTY,
  );

  useEffect(() => {
    if (key) prefetch(key, { groupId });
  }, [key, groupId]);

  useEffect(() => {
    if (key && enabled) provision(key, { groupId }, seed);
    // The seed only matters the first time; a new seed must not re-provision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, groupId, enabled]);

  const save = useCallback(
    async (next: string): Promise<SetSlugResult> => {
      const res = await setSlug({ groupId }, next);
      if (res.ok && key) {
        const prev = cache.get(key)?.slug ?? null;
        put(key, { slug: normalizeSlug(next) || prev, resolved: true, provisioned: true });
      }
      return res;
    },
    [groupId, key],
  );

  // Signed out there's no account slug: the seed is the link.
  const resolved = key ? entry.resolved && (entry.provisioned || !!entry.slug) : true;
  return {
    // Empty while loading (no seed flash); the seed only fills in once resolution
    // has finished without an account slug.
    slug: entry.slug ?? (resolved ? seed : ""),
    canCustomize: entry.slug != null && ownsScope,
    ready: resolved,
    save,
  };
}
