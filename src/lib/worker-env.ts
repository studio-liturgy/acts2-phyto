// Shared server-side helpers for the API routes (Cloudflare Worker runtime).
// Imported only by `*/api/*` route handlers, never the client.

/**
 * Reads a server-only env var from the Cloudflare Worker runtime (.dev.vars
 * locally, encrypted secrets in production), falling back to process.env. The
 * `cloudflare:workers` module only exists in the Worker runtime, so it's
 * imported dynamically to keep it out of the client bundle.
 */
export async function readEnv(key: string): Promise<string | undefined> {
  try {
    const { env } = await import("cloudflare:workers");
    if (env?.[key] != null) return env[key];
  } catch {
    // not running in the Worker runtime — fall through
  }
  return process.env[key];
}

/**
 * Builds a naive in-memory per-IP rate limiter. Each call returns an independent
 * limiter with its own bucket map, so separate routes don't share a quota.
 * Defaults to 5 requests / minute / IP.
 */
export function makeRateLimiter({
  limit = 5,
  windowMs = 60_000,
}: { limit?: number; windowMs?: number } = {}) {
  const hits = new Map<string, number[]>();
  return function rateLimited(ip: string): boolean {
    const now = Date.now();
    const arr = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
    if (arr.length >= limit) {
      hits.set(ip, arr);
      return true;
    }
    arr.push(now);
    hits.set(ip, arr);
    return false;
  };
}
