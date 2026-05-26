import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const SPREADSHEET_ID = "1CyehD4sCN1U6rozbdbQDcSnnmTQESVq2TMK_dwXsGhM";
const SHEET_RANGE = "Sheet1!A:E";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_sheets/v4";

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
        const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
        const GOOGLE_SHEETS_API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
        if (!LOVABLE_API_KEY || !GOOGLE_SHEETS_API_KEY) {
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
        const row = [
          new Date().toISOString(),
          category,
          message,
          email ?? "",
          userAgent,
        ];

        const url = `${GATEWAY_URL}/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_RANGE}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": GOOGLE_SHEETS_API_KEY,
          },
          body: JSON.stringify({ values: [row] }),
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          console.error(`Sheets append failed [${res.status}]: ${detail}`);
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
