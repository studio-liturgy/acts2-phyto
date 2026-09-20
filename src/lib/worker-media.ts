// Server-side helpers shared by the media and account API routes (Cloudflare
// Worker runtime): the R2 binding surface, per-user storage accounting, env
// access, and caller identification from a Supabase access token. Imported
// only by `*/api/*` route handlers, never the client.

// Minimal R2 binding surface we rely on — avoids pulling in @cloudflare/workers-types.
export interface R2ListResult {
  objects: Array<{ key: string; size: number }>;
  truncated: boolean;
  cursor?: string;
}
export interface R2BucketLike {
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | null,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  list(options?: { prefix?: string; cursor?: string }): Promise<R2ListResult>;
  delete(key: string | string[]): Promise<void>;
}

/** Every object key under a user's `${userId}/` prefix, paginating through
 *  R2's truncated list responses. */
export async function listUserObjects(
  bucket: R2BucketLike,
  userId: string,
): Promise<Array<{ key: string; size: number }>> {
  const out: Array<{ key: string; size: number }> = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: `${userId}/`, cursor });
    out.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out;
}

/** Sums the total bytes a user already has stored under their prefix. */
export async function usedBytes(bucket: R2BucketLike, userId: string): Promise<number> {
  let total = 0;
  for (const obj of await listUserObjects(bucket, userId)) total += obj.size;
  return total;
}

/** Reads the Cloudflare Worker runtime env (string vars + bindings). The
 *  `cloudflare:workers` module only exists in the Worker runtime, so it's
 *  imported dynamically to keep it out of the client bundle. Falls back to
 *  process.env for string vars when running outside the Worker (dev tooling). */
export async function getWorkerEnv(): Promise<Record<string, unknown>> {
  try {
    const { env } = (await import("cloudflare:workers")) as {
      env: Record<string, unknown>;
    };
    if (env) return env;
  } catch {
    // not running in the Worker runtime — fall through
  }
  return process.env as unknown as Record<string, unknown>;
}

export function readString(env: Record<string, unknown>, key: string): string | undefined {
  const v = env[key];
  if (typeof v === "string" && v.length > 0) return v;
  const p = process.env[key];
  return p && p.length > 0 ? p : undefined;
}

/** Validates the caller's Supabase access token against the auth REST endpoint
 *  and returns their user id, or null if the token is missing/invalid. */
export async function getUserId(
  request: Request,
  supabaseUrl: string,
  apiKey: string,
): Promise<string | null> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: apiKey },
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: string };
    return typeof user.id === "string" ? user.id : null;
  } catch {
    return null;
  }
}
