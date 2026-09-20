import { createFileRoute } from "@tanstack/react-router";
import {
  IMAGE_MAX_BYTES,
  IMAGE_EXT_BY_TYPE,
  MEDIA_MAX_BYTES,
  MEDIA_USER_QUOTA_BYTES,
  UPLOAD_EXT_BY_TYPE,
} from "@/lib/media";
import {
  getUserId,
  getWorkerEnv,
  readString,
  usedBytes,
  type R2BucketLike,
} from "@/lib/worker-media";

// Naive in-memory rate limit, per user. Sized for images rather than videos:
// importing a single multi-page PDF fans out into one upload per page, so the
// old video-shaped limit of 20 would reject an ordinary sermon deck. The
// per-user storage quota below is the real backstop.
const RATE_LIMIT = 300;
const WINDOW_MS = 5 * 60_000;
const hits = new Map<string, number[]>();

function rateLimited(id: string): boolean {
  const now = Date.now();
  const arr = (hits.get(id) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= RATE_LIMIT) {
    hits.set(id, arr);
    return true;
  }
  arr.push(now);
  hits.set(id, arr);
  return false;
}

export const Route = createFileRoute("/api/media/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = await getWorkerEnv();
        const SUPABASE_URL = readString(env, "SUPABASE_URL");
        const SUPABASE_KEY =
          readString(env, "SUPABASE_SERVICE_ROLE_KEY") ?? readString(env, "SUPABASE_ANON_KEY");
        const MEDIA_PUBLIC_BASE = readString(env, "MEDIA_PUBLIC_BASE");
        const bucket = env.MEDIA as R2BucketLike | undefined;

        if (!SUPABASE_URL || !SUPABASE_KEY) {
          return Response.json({ ok: false, error: "Auth is not configured." }, { status: 500 });
        }
        if (!bucket || !MEDIA_PUBLIC_BASE) {
          return Response.json(
            { ok: false, error: "Media storage is not configured." },
            { status: 500 },
          );
        }

        const userId = await getUserId(request, SUPABASE_URL, SUPABASE_KEY);
        if (!userId) {
          return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
        }
        if (rateLimited(userId)) {
          return Response.json(
            { ok: false, error: "Too many uploads. Please try again shortly." },
            { status: 429 },
          );
        }

        const contentType = (request.headers.get("content-type") ?? "")
          .split(";")[0]
          .trim()
          .toLowerCase();
        const ext = UPLOAD_EXT_BY_TYPE[contentType];
        if (!ext) {
          return Response.json({ ok: false, error: "Unsupported file type." }, { status: 415 });
        }

        // Images are downscaled client-side, so they get a much tighter cap
        // than video.
        const maxBytes = contentType in IMAGE_EXT_BY_TYPE ? IMAGE_MAX_BYTES : MEDIA_MAX_BYTES;
        const declaredLength = Number(request.headers.get("content-length") ?? "0");
        if (!declaredLength || declaredLength > maxBytes) {
          return Response.json({ ok: false, error: "File too large." }, { status: 413 });
        }
        if (!request.body) {
          return Response.json({ ok: false, error: "Empty body." }, { status: 400 });
        }

        // Enforce the per-user total storage quota before writing.
        let used: number;
        try {
          used = await usedBytes(bucket, userId);
        } catch (err) {
          console.error("R2 list failed", err);
          return Response.json({ ok: false, error: "Upload failed." }, { status: 500 });
        }
        if (used + declaredLength > MEDIA_USER_QUOTA_BYTES) {
          const limitMb = Math.round(MEDIA_USER_QUOTA_BYTES / (1024 * 1024));
          return Response.json(
            {
              ok: false,
              code: "quota",
              error: `Storage limit reached. Each account can store up to ${limitMb} MB of media.`,
            },
            { status: 413 },
          );
        }

        const key = `${userId}/${crypto.randomUUID()}.${ext}`;
        try {
          await bucket.put(key, request.body, { httpMetadata: { contentType } });
        } catch (err) {
          console.error("R2 upload failed", err);
          return Response.json({ ok: false, error: "Upload failed." }, { status: 500 });
        }

        return Response.json({
          ok: true,
          url: `${MEDIA_PUBLIC_BASE.replace(/\/+$/, "")}/${key}`,
        });
      },

      // Deletes a single uploaded object so users can reclaim quota. The caller
      // sends the public URL of a file they uploaded; we derive the R2 key and
      // refuse to touch anything outside the caller's own `${userId}/` prefix.
      DELETE: async ({ request }) => {
        const env = await getWorkerEnv();
        const SUPABASE_URL = readString(env, "SUPABASE_URL");
        const SUPABASE_KEY =
          readString(env, "SUPABASE_SERVICE_ROLE_KEY") ?? readString(env, "SUPABASE_ANON_KEY");
        const MEDIA_PUBLIC_BASE = readString(env, "MEDIA_PUBLIC_BASE");
        const bucket = env.MEDIA as R2BucketLike | undefined;

        if (!SUPABASE_URL || !SUPABASE_KEY) {
          return Response.json({ ok: false, error: "Auth is not configured." }, { status: 500 });
        }
        if (!bucket || !MEDIA_PUBLIC_BASE) {
          return Response.json(
            { ok: false, error: "Media storage is not configured." },
            { status: 500 },
          );
        }

        const userId = await getUserId(request, SUPABASE_URL, SUPABASE_KEY);
        if (!userId) {
          return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
        }

        let url: string | undefined;
        try {
          const body = (await request.json()) as { url?: string };
          url = typeof body.url === "string" ? body.url : undefined;
        } catch {
          // fall through to the missing-url error below
        }
        const base = `${MEDIA_PUBLIC_BASE.replace(/\/+$/, "")}/`;
        if (!url || !url.startsWith(base)) {
          return Response.json({ ok: false, error: "Bad request." }, { status: 400 });
        }

        // Only the owner's own objects (`${userId}/…`) may be deleted.
        const key = decodeURIComponent(url.slice(base.length));
        if (!key.startsWith(`${userId}/`) || key.includes("..")) {
          return Response.json({ ok: false, error: "Forbidden." }, { status: 403 });
        }

        try {
          await bucket.delete(key);
        } catch (err) {
          console.error("R2 delete failed", err);
          return Response.json({ ok: false, error: "Delete failed." }, { status: 500 });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
