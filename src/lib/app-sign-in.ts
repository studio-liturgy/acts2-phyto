import { supabase } from "@/lib/supabase";
import { APPLE_NAME_KEY } from "@/lib/profile";
import { APP_STATE_PREFIX, appStartUrl, parseAnswer } from "@/lib/web-sign-in";

/**
 * Sign in with Google inside the phyto app. Google refuses sign-in inside an
 * app's web view, and a plain link leaves for Safari (and signs Safari in,
 * not the app). So the app opens Google's page in the system sign-in sheet
 * (ASWebAuthenticationSession, phyto-app WebAuth plugin), which shares
 * Safari's Google login and returns to the app on `live.phyto.app://`.
 * The page then finishes on /auth/callback as a browser sign-in would.
 *
 * Supabase must allow `APP_AUTH_REDIRECT` (Authentication > URL
 * Configuration > Redirect URLs), or it sends the sheet to the Site URL.
 */

export const APP_AUTH_SCHEME = "live.phyto.app";
export const APP_AUTH_REDIRECT = `${APP_AUTH_SCHEME}://auth/callback`;

type WebAuth = { start: (o: { url: string; callbackScheme: string }) => Promise<{ url: string }> };

function webAuthPlugin(): WebAuth | null {
  if (typeof window === "undefined") return null;
  const cap = (
    window as unknown as {
      Capacitor?: {
        Plugins?: { WebAuth?: WebAuth };
        registerPlugin?: (name: string) => WebAuth;
        isPluginAvailable?: (name: string) => boolean;
      };
    }
  ).Capacitor;
  if (!cap) return null;
  if (cap.Plugins?.WebAuth) return cap.Plugins.WebAuth;
  if (cap.isPluginAvailable && !cap.isPluginAvailable("WebAuth")) return null;
  return cap.registerPlugin?.("WebAuth") ?? null;
}

/** `live.phyto.app://auth/callback?code=…#…` -> `/auth/callback?code=…#…`. */
export function callbackPath(appUrl: string): string | null {
  try {
    const u = new URL(appUrl);
    if (u.protocol !== `${APP_AUTH_SCHEME}:`) return null;
    return `/auth/callback${u.search}${u.hash}`;
  } catch {
    return null;
  }
}

export type AppSignIn =
  | { ok: true; callbackPath: string }
  | { ok: false; cancelled: boolean; error: string };

/**
 * Test build: the sheet opens on phyto's own address (lib/web-sign-in.ts),
 * so iOS asks to use "phytoexp.live" (or "phyto.live"), not the Supabase
 * project's address. Google's identity token comes back on
 * `live.phyto.app://` and is handed to Supabase here, like Apple's.
 */
export async function signInWithGoogleInAppDirect(): Promise<
  { ok: true } | { ok: false; cancelled: boolean; error: string }
> {
  const plugin = webAuthPlugin();
  if (!plugin) return { ok: false, cancelled: false, error: "Google sign in isn't available." };
  const nonce = crypto.randomUUID() + crypto.randomUUID();
  const state = APP_STATE_PREFIX + crypto.randomUUID();
  const start = appStartUrl(window.location.origin, "google", state, await sha256Hex(nonce));
  let back: string;
  try {
    back = (await plugin.start({ url: start, callbackScheme: APP_AUTH_SCHEME })).url;
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    return { ok: false, cancelled: code === "CANCELLED", error: "Google sign in didn't finish." };
  }
  let hash = "";
  try {
    hash = new URL(back).hash;
  } catch {
    // Not a URL: treated as a failed answer below.
  }
  const answer = parseAnswer(hash);
  if (!answer.ok) {
    return { ok: false, cancelled: answer.cancelled, error: "Google sign in didn't finish." };
  }
  if (answer.state !== state) {
    return { ok: false, cancelled: false, error: "Google sign in didn't finish." };
  }
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: answer.idToken,
    nonce,
  });
  if (error || !data.session) {
    return {
      ok: false,
      cancelled: false,
      error: error?.message ?? "Google sign in didn't finish.",
    };
  }
  return { ok: true };
}

export async function signInWithGoogleInApp(): Promise<AppSignIn> {
  const plugin = webAuthPlugin();
  if (!plugin) {
    // An app build without the sheet: the old way (it opens Safari).
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/auth/callback" },
    });
    return { ok: false, cancelled: true, error: "" };
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: APP_AUTH_REDIRECT, skipBrowserRedirect: true },
  });
  if (error || !data?.url) {
    return {
      ok: false,
      cancelled: false,
      error: error?.message ?? "Couldn't start Google sign in.",
    };
  }
  try {
    const { url } = await plugin.start({ url: data.url, callbackScheme: APP_AUTH_SCHEME });
    const path = callbackPath(url);
    if (!path) return { ok: false, cancelled: false, error: "Google sign in didn't finish." };
    return { ok: true, callbackPath: path };
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    return { ok: false, cancelled: code === "CANCELLED", error: "Google sign in didn't finish." };
  }
}

type AppleSignIn = {
  signIn: (o: { nonce: string }) => Promise<{
    identityToken: string;
    authorizationCode?: string;
    givenName?: string;
    familyName?: string;
  }>;
};

function appleSignInPlugin(): AppleSignIn | null {
  if (typeof window === "undefined") return null;
  const cap = (
    window as unknown as {
      Capacitor?: {
        Plugins?: { AppleSignIn?: AppleSignIn };
        registerPlugin?: (name: string) => AppleSignIn;
        isPluginAvailable?: (name: string) => boolean;
      };
    }
  ).Capacitor;
  if (!cap) return null;
  if (cap.Plugins?.AppleSignIn) return cap.Plugins.AppleSignIn;
  if (cap.isPluginAvailable && !cap.isPluginAvailable("AppleSignIn")) return null;
  return cap.registerPlugin?.("AppleSignIn") ?? null;
}

/** Whether this app build has the native Sign in with Apple sheet. */
export function canSignInWithApple(): boolean {
  return appleSignInPlugin() !== null;
}

/** Hex SHA-256, for the nonce Apple signs (Supabase checks the raw one). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Sign in with Apple in the iPhone app: the native sheet (Face ID, Hide My
 * Email) returns Apple's identity token, which Supabase turns into a session
 * here in the page (Supabase's Apple provider lists `live.phyto.app` as a
 * client id). No browser round trip.
 */
export async function signInWithAppleInApp(): Promise<
  { ok: true } | { ok: false; cancelled: boolean; error: string }
> {
  const plugin = appleSignInPlugin();
  if (!plugin) return { ok: false, cancelled: false, error: "Sign in with Apple isn't available." };
  const raw = crypto.randomUUID() + crypto.randomUUID();
  let token: string;
  try {
    const r = await plugin.signIn({ nonce: await sha256Hex(raw) });
    token = r.identityToken;
    // Apple gives the name only the first time: keep it for the username.
    const name = [r.givenName, r.familyName].filter(Boolean).join(" ").trim();
    if (name) localStorage.setItem(APPLE_NAME_KEY, name);
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    return { ok: false, cancelled: code === "CANCELLED", error: "Apple sign in didn't finish." };
  }
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token,
    nonce: raw,
  });
  if (error || !data.session) {
    return { ok: false, cancelled: false, error: error?.message ?? "Apple sign in didn't finish." };
  }
  return { ok: true };
}

/**
 * Apple's sheet once more, for Delete Account: returns a fresh one-time
 * authorization code the server trades for Apple's token and revokes.
 * "cancelled" when the person closes the sheet; null when this app build
 * can't give a code (older builds), so the deletion goes ahead without it.
 */
export async function appleAuthorizationCode(): Promise<string | "cancelled" | null> {
  const plugin = appleSignInPlugin();
  if (!plugin) return null;
  try {
    const r = await plugin.signIn({ nonce: await sha256Hex(crypto.randomUUID()) });
    return r.authorizationCode || null;
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    return code === "CANCELLED" ? "cancelled" : null;
  }
}
