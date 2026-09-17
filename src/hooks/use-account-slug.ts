import { useCallback, useEffect, useState } from "react";
import { ensureSlug, setSlug, type SetSlugResult, type SlugScope } from "@/lib/account-slug";
import { normalizeSlug } from "@/lib/slug";

/**
 * Drives the share dialog's custom URL for a scope (personal or a group). When
 * `enabled` (the dialog is open) it provisions/loads the account slug, seeded
 * from the primary gathering's share_token. Returns the effective slug to show
 * and a save handler; `canCustomize` is false when the account slug can't be
 * reached (signed out, or the migration isn't applied), so the caller falls back
 * to the gathering's own share_token as a plain, read-only link.
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
  loading: boolean;
  save: (slug: string) => Promise<SetSlugResult>;
} {
  const [accountSlug, setAccountSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    ensureSlug(scope, seed).then((s) => {
      if (!cancelled) {
        setAccountSlug(s);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, scope.groupId, seed]);

  const save = useCallback(
    async (next: string): Promise<SetSlugResult> => {
      const res = await setSlug(scope, next);
      if (res.ok) setAccountSlug((prev) => normalizeSlug(next) || prev);
      return res;
    },
    [scope.groupId],
  );

  return {
    slug: accountSlug ?? seed,
    canCustomize: accountSlug != null,
    loading,
    save,
  };
}
