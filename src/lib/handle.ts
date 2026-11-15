/**
 * @usernames, shared with antho (its `profiles` table, same accounts): unique,
 * lowercase. A copy of antho's src/lib/handle.ts: keep the two the same. The
 * database enforces the pattern, so these checks are for friendly messages.
 */

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 24;
export const HANDLE_PATTERN = /^[a-z0-9_]{3,24}$/;

/** Names that would read as official or collide with app routes. */
const RESERVED = new Set([
  "admin",
  "antho",
  "phyto",
  "api",
  "auth",
  "room",
  "host",
  "join",
  "new",
  "login",
  "logout",
  "welcome",
  "settings",
  "help",
  "support",
  "about",
  "terms",
  "privacy",
  "studioliturgy",
  "studio_liturgy",
]);

/** Trims, drops a leading @, and lowercases what someone typed. */
export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@+/, "").toLowerCase();
}

export type HandleProblem = "too-short" | "too-long" | "characters" | "reserved";

/** Returns what's wrong with a normalized handle, or null when it's usable. */
export function handleProblem(handle: string): HandleProblem | null {
  if (handle.length < HANDLE_MIN) return "too-short";
  if (handle.length > HANDLE_MAX) return "too-long";
  if (!HANDLE_PATTERN.test(handle)) return "characters";
  if (RESERVED.has(handle)) return "reserved";
  return null;
}

export const HANDLE_PROBLEM_COPY: Record<HandleProblem, string> = {
  "too-short": `At least ${HANDLE_MIN} characters.`,
  "too-long": `At most ${HANDLE_MAX} characters.`,
  characters: "Lowercase letters, numbers and underscores only.",
  reserved: "That one's reserved. Try another.",
};
