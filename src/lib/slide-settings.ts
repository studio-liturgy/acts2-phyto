// The Song Template, Scripture Template and fade time: account-level, like the
// Background (lib/background.ts). Kept on this device (so the output window
// and other tabs see a change at once) and, signed in, on the personal
// workspace_settings row's `song_template`, `scripture_template` and `fade_ms`
// columns (migrations/2026-10-28-account-slide-settings.sql), so every device
// the account signs in on gets them. Personal row whatever workspace is
// active. Read and written by their own query, never through
// fetchWorkspaceSettings or the background's: an unapplied column errors and
// would freeze whatever shares the query.

import { supabase } from "./supabase";
import { useAuthStore } from "./authStore";
import type { SetTemplate } from "./types";

const SLIDE_FONT_STACK = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

// Spread these (`{ ...DEFAULT_* }`) so each caller gets a fresh object.
export const DEFAULT_SONG_TEMPLATE: SetTemplate = {
  fontScale: 1,
  fontFamily: SLIDE_FONT_STACK,
  bg: "black",
  position: "centre",
  textCase: "mixed",
};
export const DEFAULT_SCRIPTURE_TEMPLATE: SetTemplate = {
  fontScale: 1,
  fontFamily: SLIDE_FONT_STACK,
  bg: "black",
  align: "left",
  referencePosition: "below",
};
export const DEFAULT_FADE_MS = 0;

export type SlideSettings = {
  songTemplate: SetTemplate;
  scriptureTemplate: SetTemplate;
  fadeMs: number;
};

/** The account's copy; a field is null when the account has never saved it. */
export type FetchedSlideSettings = {
  songTemplate: SetTemplate | null;
  scriptureTemplate: SetTemplate | null;
  fadeMs: number | null;
};

const TEMPLATE_KEYS = [
  "fontScale",
  "fontFamily",
  "bg",
  "align",
  "referencePosition",
  "position",
  "textCase",
] as const;

/** A stored value as a SetTemplate, anything unknown dropped. Null when it
 *  isn't an object at all (nothing stored yet). */
export function parseTemplate(value: unknown): SetTemplate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const out: SetTemplate = {};
  if (typeof v.fontScale === "number" && Number.isFinite(v.fontScale) && v.fontScale > 0) {
    out.fontScale = v.fontScale;
  }
  if (typeof v.fontFamily === "string" && v.fontFamily) out.fontFamily = v.fontFamily;
  if (v.bg === "black" || v.bg === "white") out.bg = v.bg;
  if (v.align === "center" || v.align === "left") out.align = v.align;
  if (v.referencePosition === "above" || v.referencePosition === "below") {
    out.referencePosition = v.referencePosition;
  }
  if (v.position === "top" || v.position === "centre") out.position = v.position;
  if (v.textCase === "upper" || v.textCase === "mixed") out.textCase = v.textCase;
  return out;
}

/** A stored fade time in ms, or null when nothing usable is stored. */
export function parseFadeMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

export function sameTemplate(a: SetTemplate, b: SetTemplate): boolean {
  return TEMPLATE_KEYS.every((k) => (a[k] ?? null) === (b[k] ?? null));
}

/** What one account read means for this device. A field the account has
 *  never saved takes this device's value, unless it's still the default (the
 *  first device opened with a real choice wins, as with the Background). A
 *  field the account has, and that differs here, is adopted. */
export function planSlideSettingsSync(
  fetched: FetchedSlideSettings,
  local: SlideSettings,
): { adopt: Partial<SlideSettings>; upload: Partial<SlideSettings> } {
  const adopt: Partial<SlideSettings> = {};
  const upload: Partial<SlideSettings> = {};

  if (!fetched.songTemplate) {
    if (!sameTemplate(local.songTemplate, DEFAULT_SONG_TEMPLATE)) {
      upload.songTemplate = local.songTemplate;
    }
  } else if (!sameTemplate(fetched.songTemplate, local.songTemplate)) {
    adopt.songTemplate = fetched.songTemplate;
  }

  if (!fetched.scriptureTemplate) {
    if (!sameTemplate(local.scriptureTemplate, DEFAULT_SCRIPTURE_TEMPLATE)) {
      upload.scriptureTemplate = local.scriptureTemplate;
    }
  } else if (!sameTemplate(fetched.scriptureTemplate, local.scriptureTemplate)) {
    adopt.scriptureTemplate = fetched.scriptureTemplate;
  }

  if (fetched.fadeMs === null) {
    if (local.fadeMs !== DEFAULT_FADE_MS) upload.fadeMs = local.fadeMs;
  } else if (fetched.fadeMs !== local.fadeMs) {
    adopt.fadeMs = fetched.fadeMs;
  }

  return { adopt, upload };
}

// --- The account's copy ---

/** The account's slide settings. Null on a read error (offline, or the
 *  migration not applied yet: the columns don't exist), so callers keep what
 *  they have. Signed out: nothing to read. */
export async function fetchAccountSlideSettings(): Promise<FetchedSlideSettings | null> {
  const userId = useAuthStore.getState().session?.user.id ?? null;
  if (!userId) return null;
  const { data, error } = await supabase
    .from("workspace_settings")
    .select("song_template, scripture_template, fade_ms")
    .eq("user_id", userId)
    .is("group_id", null)
    .limit(1)
    .maybeSingle();
  if (error) {
    // 42703: the columns aren't there yet; 42P01 / PGRST205: no table. Quiet,
    // this runs on every poll.
    const code = (error as { code?: string }).code;
    if (code !== "42703" && code !== "42P01" && code !== "PGRST205") {
      console.error("[slide-settings] read failed:", error);
    }
    return null;
  }
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    songTemplate: parseTemplate(row.song_template),
    scriptureTemplate: parseTemplate(row.scripture_template),
    fadeMs: parseFadeMs(row.fade_ms),
  };
}

/** Save the given fields on the account (inserting the personal row on first
 *  use). Only the fields passed are written, so one device's song change
 *  never carries its stale scripture template along. False on failure. */
export async function saveAccountSlideSettings(patch: Partial<SlideSettings>): Promise<boolean> {
  const userId = useAuthStore.getState().session?.user.id ?? null;
  if (!userId) return false;
  const values: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.songTemplate) values.song_template = patch.songTemplate;
  if (patch.scriptureTemplate) values.scripture_template = patch.scriptureTemplate;
  if (patch.fadeMs !== undefined) values.fade_ms = patch.fadeMs;
  if (Object.keys(values).length === 1) return true;
  // The unique key is a partial index, which PostgREST's upsert can't target:
  // find the row, update it, or insert one.
  const { data: existing, error: readErr } = await supabase
    .from("workspace_settings")
    .select("id")
    .eq("user_id", userId)
    .is("group_id", null)
    .limit(1)
    .maybeSingle();
  if (readErr) {
    console.error("[slide-settings] read failed:", readErr);
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
        .insert({ ...values, user_id: userId })
        .select("id");
  const { data, error } = await write;
  if (error) {
    const code = (error as { code?: string }).code;
    if (code !== "42703" && code !== "PGRST204") {
      console.error("[slide-settings] write failed:", error);
    }
    return false;
  }
  return (data?.length ?? 0) > 0;
}
