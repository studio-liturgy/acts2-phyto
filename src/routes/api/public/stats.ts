import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { readEnv, makeRateLimiter } from "@/lib/worker-env";

// Public aggregate stats for the /transparency page. Only two integers are
// ever returned - no row data, no PII - computed server-side with the
// service role key so nothing needs to be exposed to the anon key/RLS.
const rateLimited = makeRateLimiter({ limit: 30, windowMs: 60_000 });

export const Route = createFileRoute("/api/public/stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const SUPABASE_URL = await readEnv("SUPABASE_URL");
        const SUPABASE_SERVICE_ROLE_KEY = await readEnv("SUPABASE_SERVICE_ROLE_KEY");
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
          return Response.json({ ok: false, error: "Not configured." }, { status: 500 });
        }

        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "unknown";
        if (rateLimited(ip)) {
          return Response.json({ ok: false, error: "Too many requests." }, { status: 429 });
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const [usersResult, setsResult] = await Promise.all([
          // perPage: 1 keeps the response tiny - GoTrue still computes the
          // total across all users for pagination, which is all we need.
          supabase.auth.admin.listUsers({ page: 1, perPage: 1 }),
          supabase.from("sets").select("*", { count: "exact", head: true }),
        ]);

        if (usersResult.error || setsResult.error) {
          console.error(
            `Stats query failed: ${usersResult.error?.message ?? setsResult.error?.message}`,
          );
          return Response.json({ ok: false, error: "Could not load stats." }, { status: 502 });
        }

        return Response.json({
          ok: true,
          accounts: usersResult.data.total,
          sets: setsResult.count ?? 0,
        });
      },
    },
  },
});
