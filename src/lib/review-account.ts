/**
 * The App Review account (App Store and Google Play reviewers): its sign-in
 * page shows a password box, since reviewers can't receive an email code.
 * Every other address keeps codes, Google and Apple. The account's password
 * is set in the Supabase dashboard; accounts made by email code have none.
 */
export const REVIEW_EMAIL = "appreview@studioliturgy.com";

export function isReviewEmail(email: string): boolean {
  return email.trim().toLowerCase() === REVIEW_EMAIL;
}
