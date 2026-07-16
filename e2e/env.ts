import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Minimal KEY=VALUE loader for .env / .env.local / .dev.vars — later files and
 *  real process.env win. Avoids a dotenv dependency; these files are simple. */
function parse(path: string): Record<string, string> {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const root = resolve(import.meta.dirname, "..");
const fileEnv = {
  ...parse(resolve(root, ".env")),
  ...parse(resolve(root, ".env.local")),
  ...parse(resolve(root, ".dev.vars")),
};

function required(key: string): string {
  const value = process.env[key] ?? fileEnv[key];
  if (!value) {
    throw new Error(
      `e2e: missing ${key} — expected it in the environment, .env, .env.local, or .dev.vars`,
    );
  }
  return value;
}

export const SUPABASE_URL = required("VITE_SUPABASE_URL");
export const SUPABASE_ANON_KEY = required("VITE_SUPABASE_ANON_KEY");
export const SUPABASE_SERVICE_ROLE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");

/** supabase-js v2 persists the session under sb-<project-ref>-auth-token. */
export const AUTH_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;

export const E2E_EMAIL = "phyto-e2e@example.com";
