import { createFileRoute } from "@tanstack/react-router";
import { quotaForAccount } from "@/lib/media";
import {
  getUser,
  getWorkerEnv,
  readString,
  usedBytes,
  type R2BucketLike,
} from "@/lib/worker-media";

// How much of their media quota the caller has used: the bytes stored under
// their `${userId}/` prefix in R2, against the per-account limit the upload
// route enforces. Authenticated by the caller's Supabase access token.
export const Route = createFileRoute("/api/media/usage")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const env = await getWorkerEnv();
        const SUPABASE_URL = readString(env, "SUPABASE_URL");
        const SUPABASE_KEY =
          readString(env, "SUPABASE_SERVICE_ROLE_KEY") ?? readString(env, "SUPABASE_ANON_KEY");
        const bucket = env.MEDIA as R2BucketLike | undefined;
        if (!SUPABASE_URL || !SUPABASE_KEY) {
          return Response.json({ ok: false, error: "Auth is not configured." }, { status: 500 });
        }
        if (!bucket) {
          return Response.json(
            { ok: false, error: "Media storage is not configured." },
            { status: 500 },
          );
        }
        const caller = await getUser(request, SUPABASE_URL, SUPABASE_KEY);
        if (!caller) {
          return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
        }
        try {
          const used = await usedBytes(bucket, caller.id);
          return Response.json({ ok: true, used, quota: quotaForAccount(caller.createdAt) });
        } catch (err) {
          console.error("R2 usage listing failed", err);
          return Response.json({ ok: false, error: "Could not read usage." }, { status: 500 });
        }
      },
    },
  },
});
