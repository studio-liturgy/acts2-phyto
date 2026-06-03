import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
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
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

        return Response.json({ ok: true });
      },
    },
  },
});
