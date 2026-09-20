// Per-WORKSPACE preferences: the personal account has one row, each group has
// one. See migrations/2026-09-20-workspace-settings.sql. Account-level state,
// deliberately kept OUT of the Dexie sync engine (like account slugs).

import { supabase } from "./supabase";
import { useAuthStore } from "./authStore";
import { isLangCode, langDef, type LangCode } from "./langs";
import type { SlugScope } from "./account-slug";

export type WorkspaceSettings = {
  /** false: one language (`language`, the system language) and scriptures
   *  project the version in it. true: two languages (1st `language`, 2nd
   *  `language2`) and scriptures stack the version in each. */
  multiLanguage: boolean;
  /** The workspace's (system / 1st) language. */
  language: LangCode;
  /** The 2nd language; only meaningful while multiLanguage is on. */
  language2: LangCode | null;
};

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  multiLanguage: false,
  language: "en",
  language2: null,
};

type Row = { id: string; multi_language: boolean; language: string; language2?: string | null };

export function workspaceSettingsFromRow(row: Row): WorkspaceSettings {
  return fromRow(row);
}

/** "English / Japanese" (multi-language) or "English". */
export function workspaceLanguagesLabel(s: WorkspaceSettings): string {
  const codes = s.multiLanguage ? [s.language, s.language2] : [s.language];
  return codes
    .filter((c): c is LangCode => !!c)
    .map((c) => langDef(c).label)
    .join(" / ");
}

function fromRow(row: Row): WorkspaceSettings {
  return {
    multiLanguage: !!row.multi_language,
    language: isLangCode(row.language) ? row.language : "en",
    language2: isLangCode(row.language2) ? row.language2 : null,
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

// --- Signed-out (device) copy of the PERSONAL workspace's settings ---
// The app works without an account, so the personal workspace's preferences
// live on the device too. When signed in, the account row is authoritative
// and is mirrored here; a choice made signed out is carried up to the account
// the first time it has no row of its own.
const LOCAL_KEY = "workspace-settings-personal-v1";

export function readLocalPersonalSettings(): WorkspaceSettings {
  if (typeof window === "undefined") return DEFAULT_WORKSPACE_SETTINGS;
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return DEFAULT_WORKSPACE_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<WorkspaceSettings>;
    return {
      multiLanguage: !!parsed.multiLanguage,
      language: isLangCode(parsed.language) ? parsed.language : "en",
      language2: isLangCode(parsed.language2) ? parsed.language2 : null,
    };
  } catch {
    return DEFAULT_WORKSPACE_SETTINGS;
  }
}

export function writeLocalPersonalSettings(settings: WorkspaceSettings): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(settings));
  } catch {
    // ignore: private mode / blocked storage
  }
}

export type FetchedWorkspaceSettings = {
  settings: WorkspaceSettings;
  /** False when the scope has no row yet (settings are the defaults). */
  exists: boolean;
};

/** The scope's settings, or the defaults when no row exists. Null on a read
 *  error (including the table not existing yet), so callers keep what they
 *  have rather than snapping back to the defaults on a blip. Works signed out
 *  for group scopes (public select): the phone view uses it. */
export async function fetchWorkspaceSettings(
  scope: SlugScope,
  userId: string | null = useAuthStore.getState().session?.user.id ?? null,
): Promise<FetchedWorkspaceSettings | null> {
  if (!scope.groupId && !userId) return { settings: readLocalPersonalSettings(), exists: false };
  const base = supabase
    .from("workspace_settings")
    .select("id, multi_language, language, language2");
  const { data, error } = await scoped(base, scope, userId).limit(1).maybeSingle();
  if (error) {
    // 42P01 / PGRST205: the table doesn't exist yet; 42703: a column (language2)
    // doesn't. A migration isn't applied: degrade to "unknown" quietly rather
    // than logging on every poll.
    const code = (error as { code?: string }).code;
    if (code !== "42P01" && code !== "PGRST205" && code !== "42703") {
      console.error("[workspace-settings] read failed:", error);
    }
    return null;
  }
  return data
    ? { settings: fromRow(data as Row), exists: true }
    : { settings: DEFAULT_WORKSPACE_SETTINGS, exists: false };
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
  if (patch.language2 !== undefined) values.language2 = patch.language2;

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
