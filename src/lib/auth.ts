import { supabase } from "./supabase";

export async function signInWithEmail(email: string) {
  return supabase.auth.signInWithOtp({ email });
}

export async function verifyEmailCode(email: string, token: string) {
  return supabase.auth.verifyOtp({ email, token, type: "email" });
}

export async function signOut() {
  // scope: "local" signs out THIS device only and clears the local session
  // even when the server can't be reached. The default (global) scope needs a
  // successful auth-server round-trip to revoke every session — if that call
  // fails (expired/revoked token, network trouble), the local session never
  // clears, SIGNED_OUT never fires, and the user is stuck signed in.
  try {
    return await supabase.auth.signOut({ scope: "local" });
  } catch (e) {
    console.error("[auth] signOut failed:", e);
    return { error: null };
  }
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
