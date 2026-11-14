import { supabase } from "@/lib/supabase";

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
