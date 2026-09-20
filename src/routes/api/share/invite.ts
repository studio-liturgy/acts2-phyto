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
  shareId: z.string().trim().min(1).max(64).optional(),
  ownerEmail: z.string().trim().max(255).email().optional(),
  // Present (and > 1) for a bulk share of several sets at once.
  count: z.number().int().positive().max(500).optional(),
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

        const { email, setName, shareId, ownerEmail, count } = parsed.data;
        const origin = new URL(request.url).origin;
        const isBulk = (count ?? 1) > 1;
        // Bulk (or a missing shareId) can't deep-link one set, so point at the app
        // where the recipient sees all of them in "shared with you".
        const link = !isBulk && shareId ? `${origin}/s/${shareId}` : origin;
        const name = setName || "a set";
        // Apple Mail's data detector turns anything that looks like an email
        // address into a blue underlined link, ignoring the styling (it rewrites
        // hrefless anchors too). The only thing that stops it is making the text
        // not look like an address: an invisible word joiner after the "@"
        // breaks the pattern without showing or wrapping. The plain-text part
        // keeps the clean address.
        const emailLink = (addr: string) =>
          `<span style="color:inherit;text-decoration:none;white-space:nowrap;">${escapeHtml(addr).replace("@", "@&#8288;")}</span>`;
        const byText = ownerEmail ? `${ownerEmail} shared` : "Someone shared";
        const byHtml = ownerEmail ? `${emailLink(ownerEmail)} shared` : "Someone shared";
        const subject = isBulk
          ? "Sets were shared with you | phyto"
          : "A set was shared with you | phyto";
        const whatHtml = isBulk
          ? `${count} sets`
          : `<strong style="color:#F5EFEF;">${escapeHtml(name)}</strong>`;
        const whatText = isBulk ? `${count} sets` : `"${name}"`;
        const cta = isBulk ? "Open phyto" : "Open the set";
        const resend = new Resend(RESEND_API_KEY);

        // Mirrors the sign-in code email: brand-blue ground, hero PNG, Space Mono
        // pill, matching footer. The code pill becomes an "Open the set" link.
        const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light only" />
    <meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no" />
    <title>A set was shared with you | phyto</title>
    <style>
      @font-face { font-family: 'Space Mono'; src: url('https://phyto.live/fonts/SpaceMono-Regular.ttf') format('truetype'); font-weight: 400; font-style: normal; }
      @media only screen and (max-width:600px) { .h1 { font-size:34px !important; } }
      /* Apple Mail auto-detects emails/dates and re-styles them as blue links,
         which is illegible on the blue ground. Force them to inherit our text. */
      a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#2E7299;font-family:Arial,Helvetica,sans-serif;letter-spacing:-0.03em;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${byText} ${whatText} with you on phyto.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#2E7299;">
      <tr><td align="center" style="padding:0;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr><td style="padding:0;font-size:0;line-height:0;">
            <img src="https://phyto.live/email/email-header.png" width="600" alt="phyto" style="display:block;width:100%;max-width:600px;height:auto;border:0;" />
          </td></tr>
          <tr><td style="padding:44px 40px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center" style="padding-bottom:28px;">
                <p style="margin:0;color:#F5EFEF;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;letter-spacing:-0.03em;">${byHtml} ${whatHtml} with you.</p>
              </td></tr>
              <tr><td align="center">
                <a href="${link}" style="display:inline-block;border:1.5px solid #F5EFEF;border-radius:9999px;color:#F5EFEF;font-family:'Space Mono',Courier,monospace;font-size:16px;line-height:1;letter-spacing:-0.02em;text-transform:uppercase;text-decoration:none;padding:16px 30px;white-space:nowrap;">${cta}</a>
              </td></tr>
              <tr><td style="padding-top:44px;text-align:center;">
                <p style="margin:0;color:#dce8ef;font-size:13px;line-height:1.6;">Sign in with ${emailLink(email)} to view and save it.</p>
                <p style="margin:2px 0 0;color:#bcd2dd;font-size:13px;line-height:1.6;">If you didn't expect this, you can safely ignore this email.</p>
              </td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:0 40px;">
            <div style="border-top:1px solid rgba(245,239,239,0.2);font-size:0;line-height:0;">&nbsp;</div>
          </td></tr>
          <tr><td align="center" style="padding:24px 40px 48px;">
            <a href="https://phyto.live/about" style="color:#F5EFEF;font-family:'Space Mono',Courier,monospace;font-size:12px;letter-spacing:0;text-transform:uppercase;text-decoration:none;padding:0 16px;">About</a>
            <a href="https://instagram.com/phyto.live" style="color:#F5EFEF;font-family:'Space Mono',Courier,monospace;font-size:12px;letter-spacing:0;text-transform:uppercase;text-decoration:none;padding:0 16px;">Instagram</a>
            <a href="https://phyto.live/donate" style="color:#F5EFEF;font-family:'Space Mono',Courier,monospace;font-size:12px;letter-spacing:0;text-transform:uppercase;text-decoration:none;padding:0 16px;">Donate</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

        const { error } = await resend.emails.send({
          from: RESEND_FROM,
          to: email,
          subject,
          text: `${byText} ${whatText} with you on phyto.\n\nOpen this link to view and save: ${link}\n\nSign in with ${email} to accept.`,
          html,
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
