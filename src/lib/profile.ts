import type { User } from "@supabase/supabase-js";
import { create } from "zustand";
import { HANDLE_MAX, HANDLE_MIN, normalizeHandle } from "./handle";
import { supabase } from "./supabase";

/**
 * The account's @username: antho's `profiles` row (user_id, handle,
 * display_name), shared by phyto and antho. Each person reads and writes only
 * their own row (RLS). phyto shows the handle; display_name is required by
 * the table, so phyto fills it quietly from the account's name.
 */
export interface Profile {
  user_id: string;
  handle: string;
  display_name: string;
}

/** undefined: not loaded; null: no username yet; "error": couldn't tell
 *  (never treated as "none", or a network blip would ask again). */
export type ProfileState = Profile | null | undefined | "error";

export const useProfile = create<{ profile: ProfileState; userId: string | null }>(() => ({
  profile: undefined,
  userId: null,
}));

export async function fetchMyProfile(userId: string): Promise<Profile | null | "error"> {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, handle, display_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return "error";
  return data;
}

/** Loads the signed-in account's username into `useProfile`. */
export async function loadMyProfile(userId: string): Promise<void> {
  useProfile.setState({ userId, profile: undefined });
  const profile = await fetchMyProfile(userId);
  if (useProfile.getState().userId === userId) useProfile.setState({ profile });
}

export function clearMyProfile(): void {
  useProfile.setState({ userId: null, profile: undefined });
}

export async function isHandleAvailable(handle: string): Promise<boolean | "error"> {
  const { data, error } = await supabase.rpc("handle_available", { candidate: handle });
  if (error) return "error";
  return data === true;
}

export type SaveProfileResult =
  | { ok: true; profile: Profile }
  | { ok: false; reason: "taken" | "error" };

export async function saveProfile(profile: Profile): Promise<SaveProfileResult> {
  const { data, error } = await supabase
    .from("profiles")
    .upsert(profile, { onConflict: "user_id" })
    .select("user_id, handle, display_name")
    .single();
  if (error) {
    // 23505: someone took the handle first.
    if (error.code === "23505") return { ok: false, reason: "taken" };
    return { ok: false, reason: "error" };
  }
  useProfile.setState({ userId: data.user_id, profile: data });
  return { ok: true, profile: data };
}

/** Where Sign in with Apple leaves the name it gives once (localStorage). */
export const APPLE_NAME_KEY = "phyto-apple-name";

/** The account's name: Google's, else the one Apple gave at sign-in. */
export function suggestDisplayName(
  user: Pick<User, "user_metadata">,
  appleName: string | null = null,
): string {
  const meta = user.user_metadata ?? {};
  const name = meta.full_name ?? meta.name ?? appleName;
  return typeof name === "string" ? name.trim().slice(0, 60) : "";
}

function cleanHandle(raw: string): string {
  const h = normalizeHandle(raw)
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, HANDLE_MAX);
  return h.length >= HANDLE_MIN ? h : "";
}

/** A starting username: from the name when there is one, else the email's
 *  first part. Apple's Hide My Email addresses are random, so never those. */
export function suggestHandle(email: string | undefined, name = ""): string {
  const fromName = cleanHandle(name.replace(/\s+/g, ""));
  if (fromName) return fromName;
  if (!email || /@privaterelay\.appleid\.com$/i.test(email)) return "";
  return cleanHandle(email.split("@")[0] ?? "");
}

/** Pages that never ask for a username: signing in, legal pages, and pages
 *  that only show someone else's slides. */
export function welcomeExempt(pathname: string): boolean {
  if (
    ["/welcome", "/auth/callback", "/login", "/legal", "/terms", "/privacy", "/output"].includes(
      pathname,
    )
  )
    return true;
  return pathname.startsWith("/g/") || pathname.startsWith("/screen/");
}

/** Whether a signed-in account must choose a username before going on. */
export function needsWelcome(pathname: string, signedIn: boolean, profile: ProfileState): boolean {
  return signedIn && profile === null && !welcomeExempt(pathname);
}
