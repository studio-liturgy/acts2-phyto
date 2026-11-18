/**
 * Sign in with Apple and Google in a browser, without Supabase's own sign-in
 * page: phyto.live sends people to Apple or Google itself, so their page says
 * "phyto.live" instead of the Supabase project's address. The answer comes
 * back to phyto.live (Apple: a form post to /api/auth/apple, which forwards
 * it to /auth/web; Google: straight to /auth/web), and the identity token is
 * handed to Supabase with `signInWithIdToken` (the same handover the iPhone
 * app uses for Apple). No client secret is involved, so nothing expires.
 *
 * Both providers sign a SHA-256 of a random nonce we keep in this tab;
 * Supabase checks the raw one against it.
 */

/** Apple's Services ID for the website (developer.apple.com). */
export const APPLE_WEB_CLIENT_ID = "live.phyto.web";
/** The Google sign-in client (the one Supabase's Google provider uses). */
export const GOOGLE_WEB_CLIENT_ID =
  "1059468141151-a31re9edb8kkq83827ei93k7rh1uf6k2.apps.googleusercontent.com";

export type WebProvider = "apple" | "google";

/** Where Apple posts its answer (a server route) and where both finish. */
export const APPLE_RETURN_PATH = "/api/auth/apple";
export const FINISH_PATH = "/auth/web";

/** sessionStorage: the sign-in in progress in this tab. */
export const WEB_SIGN_IN_KEY = "phyto-web-sign-in";

export type PendingSignIn = { provider: WebProvider; state: string; nonce: string };

/** The provider's sign-in page for this site. */
export function authorizeUrl(
  provider: WebProvider,
  origin: string,
  state: string,
  hashedNonce: string,
): string {
  if (provider === "apple") {
    const q = new URLSearchParams({
      client_id: APPLE_WEB_CLIENT_ID,
      redirect_uri: origin + APPLE_RETURN_PATH,
      response_type: "code id_token",
      // Asking for the name and email makes Apple post the answer.
      response_mode: "form_post",
      scope: "name email",
      state,
      nonce: hashedNonce,
    });
    return `https://appleid.apple.com/auth/authorize?${q}`;
  }
  const q = new URLSearchParams({
    client_id: GOOGLE_WEB_CLIENT_ID,
    redirect_uri: origin + FINISH_PATH,
    response_type: "id_token",
    scope: "openid email profile",
    prompt: "select_account",
    state,
    nonce: hashedNonce,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export type WebAnswer =
  | { ok: true; idToken: string; state: string; name: string }
  | { ok: false; cancelled: boolean };

/** Reads the provider's answer from /auth/web's fragment (`#id_token=...`). */
export function parseAnswer(hash: string): WebAnswer {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const error = p.get("error");
  const idToken = p.get("id_token");
  const state = p.get("state");
  if (error || !idToken || !state) {
    return {
      ok: false,
      cancelled: error === "access_denied" || error === "user_cancelled_authorize",
    };
  }
  return { ok: true, idToken, state, name: appleName(p.get("user")) };
}

/** Apple sends the person's name once (their first sign-in), as JSON. */
export function appleName(user: string | null): string {
  if (!user) return "";
  try {
    const n = (JSON.parse(user) as { name?: { firstName?: string; lastName?: string } }).name;
    return [n?.firstName, n?.lastName].filter(Boolean).join(" ").trim();
  } catch {
    return "";
  }
}

/** The fragment /api/auth/apple forwards to /auth/web: only the fields we use. */
export function forwardFragment(form: { get(name: string): FormDataEntryValue | null }): string {
  const out = new URLSearchParams();
  for (const k of ["id_token", "state", "user", "error"]) {
    const v = form.get(k);
    if (typeof v === "string" && v) out.set(k, v);
  }
  return out.toString();
}

/** Whether an answer belongs to the sign-in this tab started. */
export function answerMatches(pending: PendingSignIn | null, state: string): boolean {
  return !!pending && pending.state.length > 0 && pending.state === state;
}
