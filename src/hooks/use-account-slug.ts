import { useCallback, useEffect, useRef, useState } from "react";
import { ensureSlug, setSlug, type SetSlugResult, type SlugScope } from "@/lib/account-slug";
import { normalizeSlug } from "@/lib/slug";
import { useAuthStore } from "@/lib/authStore";
import { useLibrary } from "@/lib/store";

/**
 * Drives the share dialog's custom URL for a scope (personal or a group). When
 * `enabled` (the dialog is open) it provisions/loads the account slug. Returns
 * the effective slug to show and a save handler.
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
  const [accountSlug, setAccountSlug] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const groups = useLibrary((s) => s.groups);
  const ownsScope =
    !scope.groupId || groups.some((g) => g.id === scope.groupId && g.owner_id === userId);
  // Seed only matters for provisioning a first slug; keep it in a ref so a seed
  // change (e.g. creating a new gathering) never re-triggers a load or clears an
  // already-resolved slug.
  const seedRef = useRef(seed);
  seedRef.current = seed;

  // A different scope (switching workspace) invalidates the resolved slug, so
  // clear it — otherwise the previous account's/group's slug would flash.
  useEffect(() => {
    setAccountSlug(null);
    setResolved(false);
  }, [scope.groupId]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    ensureSlug(scope, seedRef.current).then((s) => {
      if (!cancelled) {
        setAccountSlug(s);
        setResolved(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, scope.groupId]);

  const save = useCallback(
    async (next: string): Promise<SetSlugResult> => {
      const res = await setSlug(scope, next);
      if (res.ok) setAccountSlug((prev) => normalizeSlug(next) || prev);
      return res;
    },
    [scope.groupId],
  );

  return {
    // Empty while loading (no seed flash); the seed only fills in once resolution
    // has finished without an account slug.
    slug: accountSlug ?? (resolved ? seed : ""),
    canCustomize: accountSlug != null && ownsScope,
    ready: resolved,
    save,
  };
}
