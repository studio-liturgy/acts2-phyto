import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { z } from "zod";

const CATEGORIES = [
  "Testimony / Encouragement",
  "Bug Fix",
  "Feature Request",
  "Design Feedback",
] as const;

const FeedbackSchema = z.object({
  category: z.enum(CATEGORIES),
  message: z.string().trim().min(1).max(5000),
  email: z
    .string()
    .trim()
    .max(255)
    .email()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

// Reads server env from the Cloudflare Worker runtime (.dev.vars locally,
// encrypted secrets in production), falling back to process.env. The
// `cloudflare:workers` module only exists in the Worker runtime, so it's
// imported dynamically to keep it out of the client bundle.
async function readEnv(key: string): Promise<string | undefined> {
  try {
    const { env } = (await import("cloudflare:workers")) as {
      env: Record<string, string | undefined>;
    };
    if (env?.[key] != null) return env[key];
  } catch {
    // not running in the Worker runtime — fall through
  }
  return process.env[key];
}

// Naive in-memory rate limit: 5 requests / minute / IP.
const RATE_LIMIT = 5;
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= RATE_LIMIT) {
    hits.set(ip, arr);
    return true;
  }
  arr.push(now);
  hits.set(ip, arr);
  return false;
}

export const Route = createFileRoute("/api/public/feedback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = await readEnv("SUPABASE_URL");
        const SUPABASE_SERVICE_ROLE_KEY = await readEnv("SUPABASE_SERVICE_ROLE_KEY");
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
          return Response.json(
            { ok: false, error: "Feedback destination is not configured." },
            { status: 500 },
          );
        }

        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "unknown";
        if (rateLimited(ip)) {
          return Response.json(
            { ok: false, error: "Too many submissions. Please try again shortly." },
            { status: 429 },
          );
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
        }

        const parsed = FeedbackSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { ok: false, error: "Invalid submission." },
            { status: 400 },
          );
        }

        const { category, message, email } = parsed.data;
        const userAgent = request.headers.get("user-agent") ?? "";

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false },
        });
        const { error } = await supabase.from("feedback").insert({
          category,
          message,
          email: email ?? null,
          user_agent: userAgent,
        });

        if (error) {
          console.error(`Feedback insert failed: ${error.message}`);
          return Response.json(
            { ok: false, error: "Could not save feedback. Please try again later." },
            { status: 502 },
          );
        }

        const RESEND_API_KEY = await readEnv("RESEND_API_KEY");
        const RESEND_FROM = await readEnv("RESEND_FROM");
        if (RESEND_API_KEY && RESEND_FROM) {
          try {
            const resend = new Resend(RESEND_API_KEY);
            await resend.emails.send({
              from: RESEND_FROM,
              to: "hello@studioliturgy.com",
              subject: `[Phyto Feedback] ${category}`,
              text: [
                `Category: ${category}`,
                `Message:\n${message}`,
                `Submitter email: ${email ?? "not provided"}`,
              ].join("\n\n"),
            });
          } catch (emailErr) {
            console.warn(`Feedback email failed: ${emailErr}`);
          }
        }

        return Response.json({ ok: true });
      },
    },
  },
});
