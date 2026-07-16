import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";

interface AuthStore {
  session: Session | null;
  isLoading: boolean;
  setSession: (session: Session | null) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  session: null,
  isLoading: true,
  setSession: (session) => set({ session, isLoading: false }),
}));

/** Returns true if the user is signed in. Use to gate auth-required features. */
export function useIsSignedIn() {
  return useAuthStore((s) => s.session !== null);
}

/** Returns the signed-in user's email, or null if signed out. */
export function useUserEmail() {
  return useAuthStore((s) => s.session?.user?.email ?? null);
}
