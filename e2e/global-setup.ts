import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { E2E_EMAIL, SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";
import { SESSION_FILE, serviceClient, wipeE2eRows } from "./fixtures/auth";

/**
 * Mints a real session for the dedicated e2e user without any email round-trip:
 * admin.generateLink produces the magic-link token hash, and an anon client
 * verifies it — the same verifyOtp surface the app's login uses. The session is
 * persisted for specs to seed into browser localStorage.
 *
 * The Supabase project is SHARED with production: the e2e user's rows are
 * RLS-isolated, and setup/teardown only ever delete rows scoped to its user id.
 */
export default async function globalSetup() {
  const admin = serviceClient();

  const created = await admin.auth.admin.createUser({
    email: E2E_EMAIL,
    email_confirm: true,
  });
  if (created.error && !/already/i.test(created.error.message)) {
    throw new Error(`e2e setup: createUser failed: ${created.error.message}`);
  }

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: E2E_EMAIL });
  if (link.error) throw new Error(`e2e setup: generateLink failed: ${link.error.message}`);

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const verified = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.data.properties.hashed_token,
  });
  if (verified.error || !verified.data.session) {
    throw new Error(`e2e setup: verifyOtp failed: ${verified.error?.message ?? "no session"}`);
  }

  mkdirSync(dirname(SESSION_FILE), { recursive: true });
  writeFileSync(SESSION_FILE, JSON.stringify(verified.data.session));

  // Start from a clean account so "fresh device" flows behave deterministically.
  await wipeE2eRows(admin, verified.data.session.user.id);
}
