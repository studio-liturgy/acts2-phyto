import { createClient, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { useAuthStore } from "./authStore";
import { createAuthGuard, isApiAuthFailure, isApiRequest, useSessionLost } from "./session-lost";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

// Every request goes through here so a refused login (401) is noticed in one
// place: renew it once, and if the server won't, sign out on this device and
// show the signed-out dialog. Without this, an expired login made the poll and
// sync retry with 401s for as long as the tab stayed open.
const guardedFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (typeof window !== "undefined") {
    const url = requestUrl(input);
    if (isApiAuthFailure(url, res.status)) {
      // Only a signed-in client sends a user token; anon requests never 401.
      if (useAuthStore.getState().session) void authGuard.reportUnauthorized();
    } else if (res.ok && isApiRequest(url)) {
      authGuard.reportOk();
    }
  }
  return res;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: guardedFetch },
});

export const authGuard = createAuthGuard({
  renew: async () => {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session) return "renewed";
    if (error && isAuthRetryableFetchError(error)) return "unreachable";
    return "rejected";
  },
  // A refused refresh usually removes the session already; this makes sure,
  // without touching the user's other devices.
  signOutLocal: async () => {
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  },
  onLost: () => useSessionLost.getState().markLost(),
  now: () => Date.now(),
});
