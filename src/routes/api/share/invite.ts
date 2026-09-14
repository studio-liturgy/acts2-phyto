import { createFileRoute } from "@tanstack/react-router";
import { Resend } from "resend";
import { z } from "zod";
import { readEnv, makeRateLimiter } from "@/lib/worker-env";

// The set_share row is created client-side under RLS (owner-only insert); this
// route just emails the invite. The link points at /s/<shareId>, which the
// invited person opens to claim + save the set.
const InviteSchema = z.object({
  email: z.string().trim().max(255).email(),
  setName: z.string().trim().max(200).optional(),
  shareId: z.string().trim().min(1).max(64),
});

const rateLimited = makeRateLimiter();

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

export const Route = createFileRoute("/api/share/invite")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const RESEND_API_KEY = await readEnv("RESEND_API_KEY");
        const RESEND_FROM = await readEnv("RESEND_FROM");
        if (!RESEND_API_KEY || !RESEND_FROM) {
          return Response.json({ ok: false, error: "Email is not configured." }, { status: 500 });
        }

        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "unknown";
        if (rateLimited(ip)) {
          return Response.json(
            { ok: false, error: "Too many requests. Please try again shortly." },
            { status: 429 },
          );
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
        }

        const parsed = InviteSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
        }

        const { email, setName, shareId } = parsed.data;
        const link = `${new URL(request.url).origin}/s/${shareId}`;
        const name = setName || "a set";
        const resend = new Resend(RESEND_API_KEY);

        const { error } = await resend.emails.send({
          from: RESEND_FROM,
          to: email,
          subject: "A set was shared with you on phyto",
          text: `Someone shared "${name}" with you on phyto.\n\nOpen this link to view and save it: ${link}\n\nSign in with ${email} to accept.`,
          html:
            `<p>Someone shared <strong>${escapeHtml(name)}</strong> with you on phyto.</p>` +
            `<p><a href="${link}">Open it to view and save</a> (sign in with ${escapeHtml(email)} to accept).</p>`,
        });

        if (error) {
          console.error(`Share invite email failed: ${error.message}`);
          return Response.json(
            { ok: false, error: "Could not send the invite email." },
            { status: 502 },
          );
        }

        return Response.json({ ok: true });
      },
    },
  },
});
