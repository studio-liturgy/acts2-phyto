// Delete Account's confirmation: type your username (his pick, Nov 23: a
// Hide My Email relay address was "ridiculous to type"). An account without
// a username yet types its email, as before. The server checks the same rule.

import { normalizeHandle } from "./handle";

/** What the person types to confirm: their username, else their email. */
export function deleteConfirmTarget(
  handle: string | null | undefined,
  email: string | null | undefined,
): { kind: "username" | "email"; value: string } {
  if (handle) return { kind: "username", value: handle };
  return { kind: "email", value: email ?? "" };
}

/** Whether what was typed confirms the deletion. Usernames ignore case, a
 *  leading @ and spaces; emails ignore case and spaces. */
export function deleteConfirmMatches(
  typed: string,
  handle: string | null | undefined,
  email: string | null | undefined,
): boolean {
  const t = typed.trim();
  if (!t) return false;
  if (handle && normalizeHandle(t) === normalizeHandle(handle)) return true;
  return !!email && t.toLowerCase() === email.trim().toLowerCase();
}
