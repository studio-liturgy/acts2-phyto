// Account-level calls that need the server (service role or R2): storage
// usage and account deletion. Both are authenticated with the caller's own
// Supabase access token.

import { supabase } from "./supabase";
import { db } from "./db";
import { signOut } from "./auth";

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export type StorageUsage = { used: number; quota: number };

/** Bytes of uploaded media this account holds, and the per-account limit. */
export async function fetchStorageUsage(): Promise<StorageUsage | null> {
  const token = await accessToken();
  if (!token) return null;
  try {
    const res = await fetch("/api/media/usage", { headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json()) as { ok: boolean; used?: number; quota?: number };
    if (!res.ok || !json.ok) return null;
    return { used: json.used ?? 0, quota: json.quota ?? 0 };
  } catch {
    return null;
  }
}

/** Delete the signed-in account and everything it owns (see the API route),
 *  then wipe this device: session, local library, and saved preferences. The
 *  email is re-checked server-side. Returns an error message, or null. */
export async function deleteAccount(confirmEmail: string): Promise<string | null> {
  const token = await accessToken();
  if (!token) return "You're not signed in.";
  let res: Response;
  try {
    res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: confirmEmail }),
    });
  } catch {
    return "Could not reach the server. Check your connection and try again.";
  }
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !json.ok) return json.error ?? "Could not delete the account.";

  // The account is gone; nothing local is worth keeping.
  await signOut();
  await Promise.all([db.sets.clear(), db.gatherings.clear(), db.gathering_sets.clear()]);
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  return null;
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(0, Math.round(n / 1024))} KB`;
  const mb = n / (1024 * 1024);
  return mb >= 100 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}
