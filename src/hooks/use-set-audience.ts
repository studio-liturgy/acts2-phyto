import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLibrary } from "@/lib/store";
import { useAuthStore } from "@/lib/authStore";
import type { Set as PhytoSet } from "@/lib/types";

/** Who else sees a set: the groups it's granted to and the people it's shared
 *  with (my own sets), or its owner (a set shared with me). */
export interface SetAudience {
  groups: string[];
  people: string[];
  /** The owner's email when the set is someone else's. */
  owner: string | null;
}

/**
 * The audience of a set. Group names come from my memberships; person-shares
 * are fetched (set_shares is readable by the owner and each grantee, so for a
 * set shared with me only the shares I can see are listed, usually just my
 * own, which is dropped). `refreshKey` refetches, e.g. when the share dialog
 * closes.
 */
export function useSetAudience(
  set: Pick<PhytoSet, "id" | "groupIds" | "shared" | "shared_by"> | null | undefined,
  refreshKey?: unknown,
): SetAudience {
  const groups = useLibrary((s) => s.groups);
  const session = useAuthStore((s) => s.session);
  const [people, setPeople] = useState<string[]>([]);
  const setId = set?.id;
  const me = (session?.user.email ?? "").toLowerCase();

  useEffect(() => {
    if (!setId || !session) {
      setPeople([]);
      return;
    }
    let cancelled = false;
    supabase
      .from("set_shares")
      .select("grantee_email")
      .eq("set_id", setId)
      .then(({ data }) => {
        if (cancelled) return;
        const emails = ((data ?? []) as { grantee_email: string }[])
          .map((r) => r.grantee_email.toLowerCase())
          .filter((e) => e && e !== me);
        setPeople([...new Set(emails)]);
      });
    return () => {
      cancelled = true;
    };
  }, [setId, session, me, refreshKey]);

  const groupNames = (set?.groupIds ?? [])
    .map((id) => groups.find((g) => g.id === id)?.name)
    .filter((n): n is string => !!n);
  return {
    groups: groupNames,
    people,
    owner: set?.shared ? (set.shared_by ?? "someone") : null,
  };
}

/** "Group A, Group B and alice@example.com", or "" when nobody. */
export function audienceLabel(a: SetAudience): string {
  const names = [...a.groups, ...a.people];
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
