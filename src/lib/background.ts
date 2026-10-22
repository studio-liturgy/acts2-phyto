// The one background behind every slide (songs, scripture, media), edited from
// the presenter's Background card. It replaced the Black/White choice the song
// and scripture templates each carried.
//
// Account-level: kept on this device (so the output window and other tabs see
// it at once) and, signed in, on the personal workspace_settings row's
// `background` column (migrations/2026-10-22-account-background.sql), so every
// device the account signs in on gets it. Personal row whatever workspace is
// active: it's how this account's screen looks, not a group setting.

import { supabase } from "./supabase";
import { useAuthStore } from "./authStore";
import type { Background, SetTemplate, SlideAspect } from "./types";

export const SLIDE_ASPECTS: SlideAspect[] = ["16:9", "16:10", "4:3", "21:9"];

export const DEFAULT_BACKGROUND: Background = { bg: "black", bgDim: 40 };

/** A stored value as a Background, anything unknown dropped. Null when it
 *  isn't an object at all (nothing stored yet). */
export function parseBackground(value: unknown): Background | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const out: Background = {
    bg: v.bg === "white" ? "white" : "black",
    bgDim:
      typeof v.bgDim === "number" && Number.isFinite(v.bgDim)
        ? Math.min(90, Math.max(0, Math.round(v.bgDim)))
        : DEFAULT_BACKGROUND.bgDim,
  };
  if (typeof v.bgImage === "string" && v.bgImage) out.bgImage = v.bgImage;
  if (SLIDE_ASPECTS.includes(v.aspect as SlideAspect)) out.aspect = v.aspect as SlideAspect;
  return out;
}

export function sameBackground(a: Background, b: Background): boolean {
  return (
    a.bg === b.bg &&
    a.bgDim === b.bgDim &&
    (a.bgImage ?? null) === (b.bgImage ?? null) &&
    (a.aspect ?? "16:9") === (b.aspect ?? "16:9")
  );
}

export function isDefaultBackground(b: Background): boolean {
  return sameBackground(b, DEFAULT_BACKGROUND);
}

// --- This device's copy ---
export const BACKGROUND_KEY = "background-v1";

/** The device's background. Before the first one is saved, the song
 *  template's old Black/White choice carries over, so nobody's slides flip
 *  colour the day the setting moved. */
export function readLocalBackground(songTemplate?: SetTemplate): Background {
  if (typeof window === "undefined") return { ...DEFAULT_BACKGROUND };
  try {
    const raw = localStorage.getItem(BACKGROUND_KEY);
    const parsed = raw ? parseBackground(JSON.parse(raw)) : null;
    if (parsed) return parsed;
  } catch {}
  return { ...DEFAULT_BACKGROUND, bg: songTemplate?.bg === "white" ? "white" : "black" };
}

export function writeLocalBackground(b: Background): void {
  try {
    localStorage.setItem(BACKGROUND_KEY, JSON.stringify(b));
  } catch {}
}

// --- The account's copy ---

export type FetchedBackground = {
  /** Null when the account has never saved one. */
  background: Background | null;
};

/** The account's background. Null on a read error (offline, or the
 *  migration not applied yet: the column doesn't exist), so callers keep what
 *  they have. Signed out: nothing to read. */
export async function fetchAccountBackground(): Promise<FetchedBackground | null> {
  const userId = useAuthStore.getState().session?.user.id ?? null;
  if (!userId) return null;
  const { data, error } = await supabase
    .from("workspace_settings")
    .select("background")
    .eq("user_id", userId)
    .is("group_id", null)
    .limit(1)
    .maybeSingle();
  if (error) {
    // 42703: the column isn't there yet; 42P01 / PGRST205: no table. Quiet,
    // this runs on every poll.
    const code = (error as { code?: string }).code;
    if (code !== "42703" && code !== "42P01" && code !== "PGRST205") {
      console.error("[background] read failed:", error);
    }
    return null;
  }
  return { background: parseBackground((data as { background?: unknown } | null)?.background) };
}

/** Save the account's background (insert the personal row on first use).
 *  Returns false when the write failed. */
export async function saveAccountBackground(b: Background): Promise<boolean> {
  const userId = useAuthStore.getState().session?.user.id ?? null;
  if (!userId) return false;
  const values = { background: b, updated_at: new Date().toISOString() };
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
    console.error("[background] read failed:", readErr);
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
    console.error("[background] write failed:", error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}
