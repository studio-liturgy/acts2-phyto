import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLibrary } from "@/lib/store";
import { useAuthStore } from "@/lib/authStore";
import type { Set as PhytoSet } from "@/lib/types";
import {
  DEFAULT_WORKSPACE_SETTINGS,
  workspaceLanguagesLabel,
  workspaceSettingsFromRow,
} from "@/lib/workspace-settings";

/** Who else sees a set: the groups it's granted to and the people it's shared
 *  with (my own sets), or its owner (a set shared with me). */
export interface SetAudience {
  groups: string[];
  people: string[];
  /** The owner's email when the set is someone else's. */
  owner: string | null;
  /** Each group's and person's workspace languages ("English / Japanese"),
   *  by name; absent while unknown (an unclaimed share, no settings row yet
   *  reads as the default). */
  languages: Record<string, string>;
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
  const [languages, setLanguages] = useState<Record<string, string>>({});
  const setId = set?.id;
  const me = (session?.user.email ?? "").toLowerCase();
  const groupKey = (set?.groupIds ?? []).join("|");

  useEffect(() => {
    if (!setId || !session) {
      setPeople([]);
      setLanguages({});
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("set_shares")
        .select("grantee_email, grantee_user_id")
        .eq("set_id", setId);
      const rows = ((data ?? []) as { grantee_email: string; grantee_user_id: string | null }[])
        .map((r) => ({ email: r.grantee_email.toLowerCase(), uid: r.grantee_user_id }))
        .filter((r) => r.email && r.email !== me);
      const emails = [...new Set(rows.map((r) => r.email))];
      // Workspace languages: the groups' rows and each claimed grantee's
      // personal row (both readable; a missing row is the default).
      const groupIds = groupKey ? groupKey.split("|") : [];
      const userIds = [...new Set(rows.map((r) => r.uid).filter((u): u is string => !!u))];
      const langs: Record<string, string> = {};
      if (groupIds.length || userIds.length) {
        const ors = [
          groupIds.length ? `group_id.in.(${groupIds.join(",")})` : "",
          userIds.length ? `user_id.in.(${userIds.join(",")})` : "",
        ].filter(Boolean);
        const { data: settingRows } = await supabase
          .from("workspace_settings")
          .select("id, user_id, group_id, multi_language, language, language2")
          .or(ors.join(","));
        const byGroup = new Map<string, string>();
        const byUser = new Map<string, string>();
        for (const r of (settingRows ?? []) as Array<{
          id: string;
          user_id: string | null;
          group_id: string | null;
          multi_language: boolean;
          language: string;
          language2: string | null;
        }>) {
          const label = workspaceLanguagesLabel(workspaceSettingsFromRow(r));
          if (r.group_id) byGroup.set(r.group_id, label);
          else if (r.user_id) byUser.set(r.user_id, label);
        }
        const fallback = workspaceLanguagesLabel(DEFAULT_WORKSPACE_SETTINGS);
        for (const id of groupIds) {
          const name = groups.find((g) => g.id === id)?.name;
          if (name) langs[name] = byGroup.get(id) ?? fallback;
        }
        for (const r of rows) if (r.uid) langs[r.email] = byUser.get(r.uid) ?? fallback;
      }
      if (cancelled) return;
      setPeople(emails);
      setLanguages(langs);
    };
    void load();
    return () => {
      cancelled = true;
    };
    // `groups` only resolves names; it needn't retrigger the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setId, session, me, groupKey, refreshKey]);

  const groupNames = (set?.groupIds ?? [])
    .map((id) => groups.find((g) => g.id === id)?.name)
    .filter((n): n is string => !!n);
  return {
    groups: groupNames,
    people,
    owner: set?.shared ? (set.shared_by ?? "someone") : null,
    languages,
  };
}

/** "Group A, Group B and alice@example.com", or "" when nobody. */
export function audienceLabel(a: SetAudience): string {
  const names = [...a.groups, ...a.people];
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
