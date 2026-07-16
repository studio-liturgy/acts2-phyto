import { loadSession, serviceClient, wipeE2eRows } from "./fixtures/auth";

/** Leave no e2e rows behind on the shared Supabase project. */
export default async function globalTeardown() {
  try {
    const session = loadSession();
    await wipeE2eRows(serviceClient(), session.user.id);
  } catch (e) {
    // Teardown must not mask test results; cleanup also reruns on next setup.
    console.warn("e2e teardown: cleanup skipped:", e);
  }
}
