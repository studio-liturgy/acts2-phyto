import { createFileRoute } from "@tanstack/react-router";
import { Resend } from "resend";
import { z } from "zod";

const WelcomeSchema = z.object({
  email: z.string().trim().max(255).email(),
  name: z.string().trim().max(200).optional(),
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

function buildWelcomeHtml(name?: string): string {
  const greeting = `Hi ${name ?? "there"},`;
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:'Space Mono',monospace,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#2563eb;padding:28px 32px;">
                <span style="color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">phyto</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">${greeting}</p>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">Welcome to phyto — your space for presenting and studying Scripture. Here's what you can do:</p>
                <ul style="margin:0 0 24px;padding-left:20px;font-size:15px;line-height:1.8;">
                  <li>Present Scripture beautifully to any screen</li>
                  <li>Build and organize your own sets</li>
                  <li>Sync your library across devices</li>
                  <li>Search and import passages fast</li>
                </ul>
                <div style="margin:0 0 24px;padding:20px;background:#f4f4f5;border-radius:8px;">
                  <p style="margin:0 0 12px;font-size:14px;line-height:1.6;">phyto is free. If it blesses you, you can support its development:</p>
                  <a href="https://ko-fi.com/valiantchan" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:10px 18px;border-radius:8px;">Support on Ko-fi</a>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #e4e4e7;font-size:12px;line-height:1.7;color:#71717a;">
                <a href="https://phyto.live" style="color:#2563eb;text-decoration:none;">phyto.live</a>
                &nbsp;·&nbsp;
                <a href="https://phyto.live/feedback" style="color:#2563eb;text-decoration:none;">Feedback</a>
                &nbsp;·&nbsp;
                <a href="https://instagram.com/phyto.live" style="color:#2563eb;text-decoration:none;">Instagram</a>
                <br />
                Reply to this email any time — we read every message.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export const Route = createFileRoute("/api/auth/welcome")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const RESEND_API_KEY = await readEnv("RESEND_API_KEY");
        const RESEND_FROM = await readEnv("RESEND_FROM");
        if (!RESEND_API_KEY || !RESEND_FROM) {
          return Response.json(
            { ok: false, error: "Email is not configured." },
            { status: 500 },
          );
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
          return Response.json(
            { ok: false, error: "Invalid request." },
            { status: 400 },
          );
        }

        const { email, name } = parsed.data;
        const resend = new Resend(RESEND_API_KEY);
        const { error } = await resend.emails.send({
          from: RESEND_FROM,
          to: email,
          subject: "Welcome to phyto",
          html: buildWelcomeHtml(name),
        });

        if (error) {
          console.error(`Welcome email failed: ${error.message}`);
          return Response.json(
            { ok: false, error: "Could not send welcome email." },
            { status: 502 },
          );
        }

        return Response.json({ ok: true });
      },
    },
  },
});
