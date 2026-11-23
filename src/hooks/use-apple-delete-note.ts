import { useAuthStore } from "@/lib/authStore";
import { appleDeleteNote, hasAppleSignIn } from "@/lib/apple-revoke";
import { canSignInWithApple } from "@/lib/app-sign-in";

/** The Delete Account dialog's extra line for an account that signs in with
 *  Apple (app: Apple's sheet finishes it; browser: remove phyto in the Apple
 *  Account settings), or null. */
export function useAppleDeleteNote(): string | null {
  const apple = useAuthStore((s) => hasAppleSignIn(s.session?.user));
  return appleDeleteNote(apple, apple && canSignInWithApple());
}
