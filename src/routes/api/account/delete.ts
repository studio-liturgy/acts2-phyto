import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import {
  getUserId,
  getWorkerEnv,
  listUserObjects,
  readString,
  type R2BucketLike,
} from "@/lib/worker-media";

// Deletes the caller's account and everything it owns. Authenticated by the
// caller's own access token (so only you can delete you); the work itself runs
// with the service role because it crosses tables RLS scopes to the owner and
// ends with the auth user, which only the admin API can remove.
//
// Order matters: every table that references auth.users without ON DELETE
// CASCADE must be emptied first or the final deleteUser fails. Groups I own go
// too (cascading their memberships, grants, slugs and settings; sets and
// gatherings in them are their contributors' and just lose the group), then my
// memberships in other groups, my grants and shares, my gatherings (cascading
// their set rows), my sets (cascading their shares/grants), and my account-level
// rows. Uploaded media leaves R2 after the tables and before the auth user:
// every step is idempotent, so a failure part-way (a table refusing, R2 down)
// leaves an account that can simply run the deletion again, with its media
// still intact until the rows that reference it are gone, and never a deleted
// user whose objects nobody can clean up.
export const Route = createFileRoute("/api/account/delete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = await getWorkerEnv();
        const SUPABASE_URL = readString(env, "SUPABASE_URL");
        const SERVICE_KEY = readString(env, "SUPABASE_SERVICE_ROLE_KEY");
        const bucket = env.MEDIA as R2BucketLike | undefined;
        if (!SUPABASE_URL || !SERVICE_KEY) {
          return Response.json({ ok: false, error: "Not configured." }, { status: 500 });
        }
        const userId = await getUserId(request, SUPABASE_URL, SERVICE_KEY);
        if (!userId) {
          return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
        }

        const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        // The caller must type their email in the dialog; verify it server-side
        // too so a stray request can't delete an account by token alone.
        let confirmEmail = "";
        try {
          const body = (await request.json()) as { email?: string };
          confirmEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        } catch {
          // handled below
        }
        const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(userId);
        const actualEmail = userRes?.user?.email?.toLowerCase() ?? "";
        if (userErr || !actualEmail || confirmEmail !== actualEmail) {
          return Response.json(
            { ok: false, error: "Email confirmation didn't match." },
            { status: 400 },
          );
        }

        try {
          const steps: Array<[string, () => PromiseLike<{ error: unknown }>]> = [
            ["groups", () => admin.from("groups").delete().eq("owner_id", userId)],
            ["group_members", () => admin.from("group_members").delete().eq("user_id", userId)],
            ["group_sets", () => admin.from("group_sets").delete().eq("owner_id", userId)],
            [
              "set_shares",
              () =>
                admin
                  .from("set_shares")
                  .delete()
                  .or(`owner_id.eq.${userId},grantee_user_id.eq.${userId}`),
            ],
            ["gatherings", () => admin.from("gatherings").delete().eq("user_id", userId)],
            ["sets", () => admin.from("sets").delete().eq("user_id", userId)],
            ["account_slugs", () => admin.from("account_slugs").delete().eq("user_id", userId)],
            [
              "workspace_settings",
              () => admin.from("workspace_settings").delete().eq("user_id", userId),
            ],
            ["deletions", () => admin.from("deletions").delete().eq("user_id", userId)],
          ];
          for (const [table, run] of steps) {
            const { error } = await run();
            // A table that doesn't exist yet (migration not applied) has nothing
            // of ours in it; anything else is a real failure.
            const code = (error as { code?: string } | null)?.code;
            if (error && code !== "42P01" && code !== "PGRST205") {
              console.error(`Account delete: ${table} failed`, error);
              return Response.json(
                { ok: false, error: `Could not remove your ${table}.` },
                { status: 500 },
              );
            }
          }

          if (bucket) {
            const keys = (await listUserObjects(bucket, userId)).map((o) => o.key);
            for (let i = 0; i < keys.length; i += 100) {
              await bucket.delete(keys.slice(i, i + 100));
            }
          }

          const { error: delErr } = await admin.auth.admin.deleteUser(userId);
          if (delErr) {
            console.error("Account delete: deleteUser failed", delErr);
            return Response.json(
              { ok: false, error: "Could not delete the account." },
              { status: 500 },
            );
          }
        } catch (err) {
          console.error("Account delete failed", err);
          return Response.json(
            { ok: false, error: "Could not delete the account." },
            { status: 500 },
          );
        }

        return Response.json({ ok: true });
      },
    },
  },
});
