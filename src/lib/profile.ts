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

/** Loads the signed-in account's username into `useProfile`. A reload for the
 *  same account (every sign-in event, page load) keeps the username already
 *  shown while it asks again, and a failed ask keeps it too: the screen never
 *  drops back to "no username" (which used to show the email instead). */
export async function loadMyProfile(userId: string): Promise<void> {
  const prev = useProfile.getState();
  const keep =
    prev.userId === userId && prev.profile && prev.profile !== "error" ? prev.profile : undefined;
  useProfile.setState({ userId, profile: keep });
  const profile = await fetchMyProfile(userId);
  if (useProfile.getState().userId !== userId) return;
  if (profile === "error" && keep) return;
  useProfile.setState({ profile });
  if (profile && profile !== "error") writeCachedHandle(userId, profile.handle);
}

export function clearMyProfile(): void {
  useProfile.setState({ userId: null, profile: undefined });
  writeCachedHandle(null, null);
}

/** The last username this device saw for the signed-in account
 *  (localStorage), so it shows at once on the next launch, before (or
 *  without) the network answer. */
export const HANDLE_CACHE_KEY = "phyto-my-handle";

type CachedHandle = { userId: string; handle: string };

function readCachedHandle(): CachedHandle | null {
  if (typeof window === "undefined") return null;
  try {
    const v = JSON.parse(window.localStorage.getItem(HANDLE_CACHE_KEY) ?? "null");
    return v && typeof v.userId === "string" && typeof v.handle === "string" ? v : null;
  } catch {
    return null;
  }
}

function writeCachedHandle(userId: string | null, handle: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (userId && handle) {
      window.localStorage.setItem(HANDLE_CACHE_KEY, JSON.stringify({ userId, handle }));
    } else window.localStorage.removeItem(HANDLE_CACHE_KEY);
  } catch {
    // Private mode: the username still shows once it has loaded.
  }
}

/** The username to show for the signed-in account: the loaded one, else the
 *  one this device saw last for the same account, else null (show nothing,
 *  never the email). */
export function myHandleFrom(
  profile: ProfileState,
  userId: string | null,
  cached: CachedHandle | null,
): string | null {
  if (profile && profile !== "error") return profile.handle;
  if (profile === null || !userId) return null;
  return cached && cached.userId === userId ? cached.handle : null;
}

/** The signed-in account's username for display (see `myHandleFrom`). */
export function useMyHandle(): string | null {
  const profile = useProfile((s) => s.profile);
  const userId = useProfile((s) => s.userId);
  return myHandleFrom(profile, userId, readCachedHandle());
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
  writeCachedHandle(data.user_id, data.handle);
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
    [
      "/welcome",
      "/auth/callback",
      "/auth/web",
      "/login",
      "/legal",
      "/terms",
      "/privacy",
      "/output",
    ].includes(pathname)
  )
    return true;
  return pathname.startsWith("/g/") || pathname.startsWith("/screen/");
}

/** Whether a signed-in account must choose a username before going on. */
export function needsWelcome(pathname: string, signedIn: boolean, profile: ProfileState): boolean {
  return signedIn && profile === null && !welcomeExempt(pathname);
}
