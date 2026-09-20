// Per-WORKSPACE preferences: the personal account has one row, each group has
// one. See migrations/2026-09-20-workspace-settings.sql. Account-level state,
// deliberately kept OUT of the Dexie sync engine (like account slugs).

import { supabase } from "./supabase";
import { useAuthStore } from "./authStore";
import { isLangCode, type LangCode } from "./langs";
import type { SlugScope } from "./account-slug";

export type WorkspaceSettings = {
  /** false: project one bible version, the one in `language`. true: stack every
   *  version a scripture set carries. */
  multiLanguage: boolean;
  /** The workspace's language. */
  language: LangCode;
};

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  multiLanguage: false,
  language: "en",
};

type Row = { id: string; multi_language: boolean; language: string };

function fromRow(row: Row): WorkspaceSettings {
  return {
    multiLanguage: !!row.multi_language,
    language: isLangCode(row.language) ? row.language : "en",
  };
}

function scoped<T extends { eq: (c: string, v: unknown) => T; is: (c: string, v: null) => T }>(
  q: T,
  scope: SlugScope,
  userId: string | null,
): T {
  return scope.groupId
    ? q.eq("group_id", scope.groupId)
    : q.eq("user_id", userId as string).is("group_id", null);
}

/** The scope's settings, or the defaults when no row exists. Null on a read
 *  error (including the table not existing yet), so callers keep what they
 *  have rather than snapping back to the defaults on a blip. Works signed out
 *  for group scopes (public select): the phone view uses it. */
export async function fetchWorkspaceSettings(
  scope: SlugScope,
  userId: string | null = useAuthStore.getState().session?.user.id ?? null,
): Promise<WorkspaceSettings | null> {
  if (!scope.groupId && !userId) return DEFAULT_WORKSPACE_SETTINGS;
  const base = supabase.from("workspace_settings").select("id, multi_language, language");
  const { data, error } = await scoped(base, scope, userId).limit(1).maybeSingle();
  if (error) {
    // 42P01 / PGRST205: the table doesn't exist yet (migration not applied).
    // Degrade to "unknown" quietly rather than logging on every poll.
    const code = (error as { code?: string }).code;
    if (code !== "42P01" && code !== "PGRST205") {
      console.error("[workspace-settings] read failed:", error);
    }
    return null;
  }
  return data ? fromRow(data as Row) : DEFAULT_WORKSPACE_SETTINGS;
}

/** Write a partial update for the scope (insert the row on first use). RLS
 *  admits the account owner for personal rows and the group owner for group
 *  rows. Returns false when the write was refused or failed. */
export async function saveWorkspaceSettings(
  scope: SlugScope,
  patch: Partial<WorkspaceSettings>,
): Promise<boolean> {
  const userId = useAuthStore.getState().session?.user.id ?? null;
  if (!userId) return false;
  const values: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.multiLanguage !== undefined) values.multi_language = patch.multiLanguage;
  if (patch.language !== undefined) values.language = patch.language;

  // The unique keys are partial indexes, which PostgREST's upsert can't target,
  // so: find the row, update it, or insert a fresh one.
  const lookup = supabase.from("workspace_settings").select("id");
  const { data: existing, error: readErr } = await scoped(lookup, scope, userId)
    .limit(1)
    .maybeSingle();
  if (readErr) {
    console.error("[workspace-settings] read failed:", readErr);
    return false;
  }
  const write = existing
    ? supabase
        .from("workspace_settings")
        .update(values)
        .eq("id", (existing as { id: string }).id)
        .select("id")
    : supabase
        .from("workspace_settings")
        .insert(
          scope.groupId ? { ...values, group_id: scope.groupId } : { ...values, user_id: userId },
        )
        .select("id");
  const { data, error } = await write;
  if (error) {
    console.error("[workspace-settings] write failed:", error);
    return false;
  }
  // An update the policy filtered out matches zero rows with no error.
  return (data?.length ?? 0) > 0;
}
