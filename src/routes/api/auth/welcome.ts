import { createFileRoute } from "@tanstack/react-router";
import { Resend } from "resend";
import { z } from "zod";
import { readEnv, makeRateLimiter } from "@/lib/worker-env";

const WelcomeSchema = z.object({
  email: z.string().trim().max(255).email(),
  name: z.string().trim().max(200).optional(),
  subscribe: z.boolean().optional(),
  skipEmail: z.boolean().optional(),
});

const rateLimited = makeRateLimiter();

export const Route = createFileRoute("/api/auth/welcome")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const RESEND_API_KEY = await readEnv("RESEND_API_KEY");
        const RESEND_FROM = await readEnv("RESEND_FROM");
        const RESEND_TEMPLATE_ID = await readEnv("RESEND_TEMPLATE_ID");
        if (!RESEND_API_KEY || !RESEND_FROM || !RESEND_TEMPLATE_ID) {
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

        const parsed = WelcomeSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
        }

        const { email, name, skipEmail } = parsed.data;
        const resend = new Resend(RESEND_API_KEY);

        if (!skipEmail) {
          const { error } = await resend.emails.send({
            from: RESEND_FROM,
            to: email,
            subject: "Welcome to phyto",
            template: { id: RESEND_TEMPLATE_ID },
          });

          if (error) {
            console.error(`Welcome email failed: ${error.message}`);
            return Response.json(
              { ok: false, error: "Could not send welcome email." },
              { status: 502 },
            );
          }
        }

        // Add to Resend Audience for mailing list + unsubscribe support.
        // Best-effort: log failures but don't block the response. The promise
        // is handed to waitUntil() so the Worker keeps running it after the
        // response is sent — otherwise Cloudflare can tear down the request
        // context before the unawaited fetch to Resend completes.
        const RESEND_AUDIENCE_ID = await readEnv("RESEND_AUDIENCE_ID");
        if (RESEND_AUDIENCE_ID && parsed.data.subscribe) {
          const nameParts = (name ?? "").trim().split(/\s+/);
          const addContact = resend.contacts
            .create({
              audienceId: RESEND_AUDIENCE_ID,
              email,
              firstName: nameParts[0] ?? "",
              lastName: nameParts.slice(1).join(" ") || undefined,
              unsubscribed: false,
            })
            .then((res) => {
              if (res.error) {
                console.error(`Audience contact create failed: ${res.error.message}`);
              }
            })
            .catch((e: unknown) => {
              console.error(
                `Audience contact create failed: ${e instanceof Error ? e.message : String(e)}`,
              );
            });

          try {
            const { waitUntil } = await import("cloudflare:workers");
            waitUntil(addContact);
          } catch {
            await addContact;
          }
        }

        return Response.json({ ok: true });
      },
    },
  },
});
