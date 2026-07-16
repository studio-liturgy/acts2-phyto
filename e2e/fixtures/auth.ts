import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { BrowserContext } from "@playwright/test";
import { AUTH_STORAGE_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../env";

export const SESSION_FILE = resolve(import.meta.dirname, "..", ".auth", "session.json");

/** Service-role client for admin ops and row assertions. NEVER ship this key
 *  to the browser context — it bypasses RLS. */
export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function loadSession(): Session {
  return JSON.parse(readFileSync(SESSION_FILE, "utf8")) as Session;
}

/** Seed the minted session into localStorage before any page script runs, so
 *  supabase-js recovers it on load and runDiff fires through the production
 *  code path — no login UI involved. */
export async function seedSession(context: BrowserContext, session: Session = loadSession()) {
  await context.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [AUTH_STORAGE_KEY, JSON.stringify(session)] as const,
  );
}

/** Delete every row owned by the e2e user — always scoped by user_id, never
 *  unscoped (the project is shared with production). gathering_sets rows
 *  cascade with their parent gathering/set. */
export async function wipeE2eRows(admin: SupabaseClient, userId: string) {
  const gatherings = await admin.from("gatherings").delete().eq("user_id", userId);
  if (gatherings.error) throw new Error(`e2e cleanup (gatherings): ${gatherings.error.message}`);
  const sets = await admin.from("sets").delete().eq("user_id", userId);
  if (sets.error) throw new Error(`e2e cleanup (sets): ${sets.error.message}`);
}
