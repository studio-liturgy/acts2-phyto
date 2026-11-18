import { supabase } from "@/lib/supabase";
import { sha256Hex } from "@/lib/app-sign-in";
import { APPLE_NAME_KEY } from "@/lib/profile";
import {
  answerMatches,
  authorizeUrl,
  parseAnswer,
  WEB_SIGN_IN_KEY,
  type PendingSignIn,
  type WebProvider,
} from "@/lib/web-sign-in";

/** Leaves for Apple's or Google's sign-in page (lib/web-sign-in.ts). */
export async function startWebSignIn(provider: WebProvider): Promise<void> {
  const nonce = crypto.randomUUID() + crypto.randomUUID();
  const state = crypto.randomUUID();
  const pending: PendingSignIn = { provider, state, nonce };
  sessionStorage.setItem(WEB_SIGN_IN_KEY, JSON.stringify(pending));
  window.location.assign(
    authorizeUrl(provider, window.location.origin, state, await sha256Hex(nonce)),
  );
}

function readPending(): PendingSignIn | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(WEB_SIGN_IN_KEY) ?? "null");
    return v && typeof v.state === "string" && typeof v.nonce === "string" ? v : null;
  } catch {
    return null;
  }
}

export type WebSignInResult = { ok: true } | { ok: false; cancelled: boolean; error: string };

/** On /auth/web: turns the provider's answer into a Supabase session. */
export async function finishWebSignIn(hash: string): Promise<WebSignInResult> {
  const pending = readPending();
  sessionStorage.removeItem(WEB_SIGN_IN_KEY);
  const answer = parseAnswer(hash);
  if (!answer.ok) {
    return {
      ok: false,
      cancelled: answer.cancelled,
      error: answer.cancelled ? "" : "Sign in didn't finish. Please try again.",
    };
  }
  if (!pending || !answerMatches(pending, answer.state)) {
    return { ok: false, cancelled: false, error: "Sign in didn't finish. Please try again." };
  }
  // Apple gives the name only the first time: keep it for the username.
  if (answer.name) localStorage.setItem(APPLE_NAME_KEY, answer.name);
  const { error } = await supabase.auth.signInWithIdToken({
    provider: pending.provider,
    token: answer.idToken,
    nonce: pending.nonce,
  });
  if (error) return { ok: false, cancelled: false, error: error.message };
  return { ok: true };
}
