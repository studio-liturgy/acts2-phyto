import { createFileRoute } from "@tanstack/react-router";
import { Resend } from "resend";
import { z } from "zod";
import { readEnv, makeRateLimiter } from "@/lib/worker-env";

// The group_members row is created client-side under RLS (owner-only insert);
// this route just emails the invite. The recipient signs in with this email to
// claim the membership and switch into the group.
const InviteSchema = z.object({
  email: z.string().trim().max(255).email(),
  groupName: z.string().trim().max(200).optional(),
  ownerEmail: z.string().trim().max(255).email().optional(),
});

const rateLimited = makeRateLimiter();

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

export const Route = createFileRoute("/api/groups/invite")({
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

        const { email, groupName, ownerEmail } = parsed.data;
        const origin = new URL(request.url).origin;
        const link = origin;
        const group = groupName || "a group";
        // Render email addresses inside an hrefless <a>: not clickable, and mail
        // clients leave text already inside an anchor alone (no blue auto-link).
        // Apple Mail's data detector turns anything that looks like an email
        // address into a blue underlined link whatever the styling; an invisible
        // word joiner after the "@" stops it matching (see share/invite.ts).
        const emailLink = (addr: string) =>
          `<span style="color:inherit;text-decoration:none;white-space:nowrap;">${escapeHtml(addr).replace("@", "@&#8288;")}</span>`;
        const byText = ownerEmail ? `${ownerEmail} invited` : "You were invited";
        const byHtml = ownerEmail ? `${emailLink(ownerEmail)} invited` : "You were invited";
        const subject = "You were invited to a group | phyto";
        const groupHtml = `<strong style="color:#F5EFEF;">${escapeHtml(group)}</strong>`;
        const resend = new Resend(RESEND_API_KEY);

        // Mirrors the sign-in and set-share emails: brand-blue ground, hero PNG,
        // Space Mono pill, matching footer.
        const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light only" />
    <meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no" />
    <title>You were invited to a group | phyto</title>
    <style>
      @font-face { font-family: 'Space Mono'; src: url('https://phyto.live/fonts/SpaceMono-Regular.ttf') format('truetype'); font-weight: 400; font-style: normal; }
      @media only screen and (max-width:600px) { .h1 { font-size:34px !important; } }
      /* Apple Mail auto-detects emails/dates and re-styles them as blue links,
         which is illegible on the blue ground. Force them to inherit our text. */
      a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#2E7299;font-family:Arial,Helvetica,sans-serif;letter-spacing:-0.03em;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${byText} you to join ${group} on phyto.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#2E7299;">
      <tr><td align="center" style="padding:0;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr><td style="padding:0;font-size:0;line-height:0;">
            <img src="https://phyto.live/email/email-header.png" width="600" alt="phyto" style="display:block;width:100%;max-width:600px;height:auto;border:0;" />
          </td></tr>
          <tr><td style="padding:44px 40px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center" style="padding-bottom:28px;">
                <p style="margin:0;color:#F5EFEF;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;letter-spacing:-0.03em;">${byHtml} you to join ${groupHtml}.</p>
              </td></tr>
              <tr><td align="center">
                <a href="${link}" style="display:inline-block;border:1.5px solid #F5EFEF;border-radius:9999px;color:#F5EFEF;font-family:'Space Mono',Courier,monospace;font-size:16px;line-height:1;letter-spacing:-0.02em;text-transform:uppercase;text-decoration:none;padding:16px 30px;white-space:nowrap;">Open phyto</a>
              </td></tr>
              <tr><td style="padding-top:44px;text-align:center;">
                <p style="margin:0;color:#dce8ef;font-size:13px;line-height:1.6;">Sign in with ${emailLink(email)} to join the group and edit its sets together.</p>
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
          text: `${byText} you to join ${group} on phyto.\n\nOpen phyto to join: ${link}\n\nSign in with ${email} to accept.`,
          html,
        });

        if (error) {
          console.error(`Group invite email failed: ${error.message}`);
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
