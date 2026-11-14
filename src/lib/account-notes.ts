/**
 * Copy for using phyto without an account (drafts OK'd Nov 8; final wording
 * goes to him with the test push). One place, so the landing notice, Settings
 * and the desktop home can't drift apart.
 */

/** Small all-caps mono note. Full width: no text-pretty / text-balance,
 *  which pull lines in and leave a gap on the right (his rule, Nov 14). */
export const ACCOUNT_NOTE_CLASS =
  "mono w-full text-[10px] uppercase leading-snug tracking-wider text-foreground/60";

/** One-time notice on tapping "Use without an account" (the app). */
export const NO_ACCOUNT_NOTICE =
  "Without an account, your library is saved only on this device. Deleting the app or losing the device deletes it for good. Sign in any time to keep a copy in your account.";

/** Signed-out desktop home in a browser, near Sign in. */
export const NO_ACCOUNT_BROWSER =
  "Without an account, your library is saved only in this browser. Clearing your browser data deletes it for good. Export a .phyto file to keep a backup, or sign in to keep a copy in your account.";

/** The app's Settings top row, by Sign in. */
export const NO_ACCOUNT_SHORT =
  "Your data is saved on this device. To sync your data and access more features, sign in.";

/** What each account-only control shows in its place when signed out. */
export const REQUIRES_ACCOUNT = {
  moreGatherings: "More than one gathering requires an account.",
  videoUpload: "Uploading videos requires an account.",
} as const;
