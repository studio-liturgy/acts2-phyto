/**
 * phytoexp.live tester allow list.
 *
 * The test build (VITE_APP_ENV=test) is open only to emails listed in the
 * Supabase table `phytoexp_testers` (migration 2026-10-28-phytoexp-testers.sql),
 * checked through the `is_phytoexp_tester` RPC. Prod (phyto.live) is untouched:
 * every helper here is a no-op there.
 *
 * Gathering and invite links made on phytoexp point at phyto.live, so the
 * people they're sent to never need tester access.
 */

export const PROD_ORIGIN = "https://phyto.live";

const isTest = import.meta.env.VITE_APP_ENV === "test";

/** True on the phytoexp.live build: the tester gate is on. */
export const TESTERS_ONLY = isTest;

/** Paths a signed-out (or not yet checked) visitor may still open on phytoexp:
 *  sign in, its callback, the legal pages it links to, and old phytoexp /g
 *  live links that are already out in the world. */
export function isOpenOnTest(pathname: string): boolean {
  if (pathname === "/login" || pathname === "/auth/callback") return true;
  if (pathname === "/legal" || pathname === "/terms" || pathname === "/privacy") return true;
  return pathname.startsWith("/g/");
}

/** Origin for links meant for other people (live /g links, invite emails).
 *  On phytoexp these always point at phyto.live; elsewhere the current site. */
export function shareOrigin(currentOrigin: string, test: boolean = isTest): string {
  return test ? PROD_ORIGIN : currentOrigin;
}

/** Browser-side shareOrigin for the current page. */
export function shareOriginHere(): string {
  return shareOrigin(typeof window !== "undefined" ? window.location.origin : "");
}

/** The live link for an account/group slug, as shown, copied and put in QR codes. */
export function liveLinkUrl(slug: string): string {
  return `${shareOriginHere()}/g/${slug}`;
}

/** The same live link on this site: a phytoexp tester's "Visit EXP link"
 *  opens the gathering in the test viewer, while the link others get stays
 *  on phyto.live. Elsewhere the link is returned as is. */
export function visitUrl(shareUrl: string, currentOrigin: string, test: boolean = isTest): string {
  if (!test || !shareUrl.startsWith(PROD_ORIGIN + "/")) return shareUrl;
  return currentOrigin + shareUrl.slice(PROD_ORIGIN.length);
}

export type TesterRpc = (
  fn: "is_phytoexp_tester",
  args: { p_email: string },
) => PromiseLike<{ data: unknown; error: unknown }>;

/** true / false from the allow list; null when the check itself failed
 *  (offline, RPC missing), so callers never sign anyone out on a network blip. */
export async function checkTester(rpc: TesterRpc, email: string): Promise<boolean | null> {
  const clean = email.trim();
  if (!clean) return false;
  try {
    const { data, error } = await rpc("is_phytoexp_tester", { p_email: clean });
    if (error || typeof data !== "boolean") return null;
    return data;
  } catch {
    return null;
  }
}

const VERIFIED_KEY = "phytoexp-tester-ok";

/** The user id last confirmed on the list on this device, so a returning
 *  tester sees the app at once while the re-check runs in the background. */
export function readVerifiedTester(storage: Pick<Storage, "getItem">): string | null {
  try {
    return storage.getItem(VERIFIED_KEY);
  } catch {
    return null;
  }
}

export function writeVerifiedTester(
  storage: Pick<Storage, "setItem" | "removeItem">,
  userId: string | null,
): void {
  try {
    if (userId) storage.setItem(VERIFIED_KEY, userId);
    else storage.removeItem(VERIFIED_KEY);
  } catch {}
}
