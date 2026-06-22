import { createFileRoute } from "@tanstack/react-router";
import { Resend } from "resend";
import { z } from "zod";

const WelcomeSchema = z.object({
  email: z.string().trim().max(255).email(),
  name: z.string().trim().max(200).optional(),
  subscribe: z.boolean().optional(),
  skipEmail: z.boolean().optional(),
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

function buildWelcomeHtml_UNUSED(): string {
  // DEPRECATED — template is now managed in the Resend dashboard.
  // Kept here for reference only; delete once the Resend template is confirmed stable.
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light only" />
    <title>Welcome to phyto</title>
    <style>
      @font-face {
        font-family: 'Space Mono';
        src: url('https://phyto.live/fonts/SpaceMono-Regular.ttf') format('truetype');
        font-weight: 400;
        font-style: normal;
      }
      @media only screen and (max-width:600px) {
        /* Constrain email width to viewport */
        .email-body { width:100% !important; }
        /* Steps: stack, keep section side padding (margins) + rounded corners, lock text width */
        .feat-pad       { direction:ltr !important; }
        .feat-pad table { direction:ltr !important; }
        .feat-img       { display:block !important; width:100% !important; }
        .feat-box       { width:100% !important; height:0 !important; padding-top:100% !important; position:relative !important; }
        .feat-box-img   { position:absolute !important; top:0 !important; left:0 !important; width:100% !important; height:100% !important; object-fit:cover !important; }
        .feat-text      { display:block !important; width:100% !important; padding:20px 0 0 !important; }
        .feat-spacer    { display:none !important; }
        /* Buttons: stack + centre on mobile, each hugging its content */
        .btn-cell     { display:block !important; text-align:center !important; padding:6px 0 !important; }
        /* Footer: stack + centre on mobile */
        .footer-left  { display:block !important; text-align:center !important; margin-bottom:8px !important; }
        .footer-right { display:block !important; text-align:center !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#F5EFEF;font-family:Arial,Helvetica,sans-serif;letter-spacing:-0.03em;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Welcome to phyto — a simple tool for home worship gatherings.</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5EFEF;">
      <tr>
        <td align="center" style="padding:0;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="email-body" style="max-width:600px;width:100%;">

            <!-- HEADER -->
            <tr>
              <td style="padding:0;font-size:0;line-height:0;">
                <img src="https://phyto.live/email/magic-link-header.png" width="600" alt="phyto"
                     style="display:block;width:100%;max-width:600px;height:auto;border:0;" />
              </td>
            </tr>

            <!-- HERO -->
            <tr>
              <td style="background:#F5EFEF;padding:56px 48px 40px;text-align:center;">
                <h1 style="margin:0 0 28px;color:#212121;font-family:Arial,Helvetica,sans-serif;font-size:36px;line-height:1.15;font-weight:400;letter-spacing:-0.045em;">
                  I built this tool for small home<br />worship gatherings,<br />like yours and mine.
                </h1>
                <p style="margin:0 0 32px;color:#212121;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.7;max-width:460px;display:inline-block;text-align:left;">
                  Unlike traditional presenter programs with complex features (colourful backgrounds, multiple outputs, livestreaming, etc.), I made this app to be an intentionally stripped back alternative to keep presenting simple and organized. It's designed to be easy to use and to protect the simplicity of worshipping with friends and family at home. All so that we can focus on the one who matters most: Jesus.
                </p>
                <br />
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://phyto.live" style="height:64px;v-text-anchor:middle;width:240px;" arcsize="50%" strokecolor="#212121" strokeweight="1.5pt" fillcolor="#F5EFEF">
                  <w:anchorlock/>
                  <center style="color:#212121;font-family:Arial,sans-serif;font-size:34px;letter-spacing:-1.5px;">Get started &#8599;</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-->
                <a href="https://phyto.live"
                   style="display:inline-block;border:1.5px solid #212121;border-radius:9999px;color:#212121;font-family:Arial,Helvetica,sans-serif;font-size:34px;line-height:1;letter-spacing:-0.045em;text-decoration:none;padding:18px 34px;white-space:nowrap;">
                  Get Started&nbsp;&nbsp;<img src="https://phyto.live/email/arrow-dark.png" width="22" height="22" alt="&#8599;" style="vertical-align:baseline;border:0;" />
                </a>
                <!--<![endif]-->
              </td>
            </tr>

            <!-- GUIDE INTRO -->
            <tr>
              <td style="background:#F5EFEF;padding:0 48px 32px;text-align:center;">
                <p style="margin:0;color:#212121;font-family:'Space Mono',Courier,monospace;font-size:12px;letter-spacing:0;text-transform:uppercase;line-height:1.6;">
                  Below is a short guide to get you started with phyto!
                </p>
              </td>
            </tr>

            <!-- STEP 1: Blue square LEFT, text RIGHT (box first in HTML = correct mobile order) -->
            <tr>
              <td class="feat-pad" style="background:#F5EFEF;padding:0 48px 48px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td class="feat-img" width="220" style="vertical-align:top;">
                      <div class="feat-box" style="background:#2E7299;border-radius:16px;width:220px;height:220px;overflow:hidden;font-size:0;line-height:0;">
                        <img class="feat-box-img" src="https://phyto.live/email/step-1.gif" width="220" height="220" alt=""
                             style="display:block;width:220px;height:220px;border:0;border-radius:16px;" />
                      </div>
                    </td>
                    <td class="feat-spacer" width="24" style="width:24px;">&nbsp;</td>
                    <td class="feat-text" style="vertical-align:top;padding-top:8px;">
                      <span style="display:inline-block;background:#2E7299;border-radius:9999px;color:#F5EFEF;font-family:'Space Mono',Courier,monospace;font-size:10px;letter-spacing:0;text-transform:uppercase;padding:4px 12px;line-height:1.4;margin-bottom:10px;">1. Build your Sets + Gatherings</span>
                      <p style="margin:0;font-size:13px;line-height:1.7;color:#212121;">Simply import your song lyrics, scriptures, or your own media into a <strong>SET</strong>. Arrange <strong>SET</strong>s into a <strong>GATHERING</strong> to stay organized and present later on.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- STEP 2: green square LEFT in HTML (image first on mobile); direction:rtl flips to text LEFT on desktop -->
            <tr>
              <td class="feat-pad" style="background:#F5EFEF;padding:0 48px 48px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="direction:rtl;">
                  <tr>
                    <td class="feat-img" width="220" style="vertical-align:top;direction:ltr;">
                      <div class="feat-box" style="background:#538844;border-radius:16px;width:220px;height:220px;overflow:hidden;font-size:0;line-height:0;">
                        <img class="feat-box-img" src="https://phyto.live/email/step-2.gif" width="220" height="220" alt=""
                             style="display:block;width:220px;height:220px;border:0;border-radius:16px;" />
                      </div>
                    </td>
                    <td class="feat-spacer" width="24" style="width:24px;">&nbsp;</td>
                    <td class="feat-text" style="vertical-align:top;padding-top:8px;direction:ltr;">
                      <span style="display:inline-block;background:#538844;border-radius:9999px;color:#F5EFEF;font-family:'Space Mono',Courier,monospace;font-size:10px;letter-spacing:0;text-transform:uppercase;padding:4px 12px;line-height:1.4;margin-bottom:10px;">2. Go online (optional)</span>
                      <p style="margin:0;font-size:13px;line-height:1.7;color:#212121;">Sign in with your email or Google account to sync your content across devices. You can also make a <strong>GATHERING</strong> go live! Share a link or QR code so your friends can follow along on their own devices in real time. Great for homes without a projector!</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- STEP 3: Orange square LEFT, text RIGHT (box first = correct mobile order) -->
            <tr>
              <td class="feat-pad" style="background:#F5EFEF;padding:0 48px 48px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td class="feat-img" width="220" style="vertical-align:top;">
                      <div class="feat-box" style="background:#E07D31;border-radius:16px;width:220px;height:220px;overflow:hidden;font-size:0;line-height:0;">
                        <img class="feat-box-img" src="https://phyto.live/email/step-3.gif" width="220" height="220" alt=""
                             style="display:block;width:220px;height:220px;border:0;border-radius:16px;" />
                      </div>
                    </td>
                    <td class="feat-spacer" width="24" style="width:24px;">&nbsp;</td>
                    <td class="feat-text" style="vertical-align:top;padding-top:8px;">
                      <span style="display:inline-block;background:#E07D31;border-radius:9999px;color:#F5EFEF;font-family:'Space Mono',Courier,monospace;font-size:10px;letter-spacing:0;text-transform:uppercase;padding:4px 12px;line-height:1.4;margin-bottom:10px;">3. Start Presenting</span>
                      <p style="margin:0;font-size:13px;line-height:1.7;color:#212121;">Connect your computer to a TV or projector, then hit <strong>Present</strong> in the top right. Drag the Output window to your display, go full screen, and your slides will appear as you click through them.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- GUIDE OUTRO -->
            <tr>
              <td style="background:#F5EFEF;padding:0 48px 48px;text-align:center;">
                <p style="margin:0;color:#212121;font-family:'Space Mono',Courier,monospace;font-size:12px;letter-spacing:0;text-transform:uppercase;line-height:1.8;">
                  Now that you've got the basics, start using it, play around with the settings and use it for your next gathering! If you have any feedback, please send it to me through <a href="https://phyto.live/feedback" style="color:#212121;text-decoration:underline;">here</a>.
                </p>
              </td>
            </tr>

            <!-- DONATION + MISSION + LINKS (one blue section) -->
            <tr>
              <td style="background:#2E7299;padding:48px;text-align:center;">
                <p style="margin:0 0 24px;color:#F5EFEF;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:1.2;font-weight:400;letter-spacing:-0.045em;">
                  This project will always be free and open source. If you feel God's prompting, I want to invite you to partner with me financially by giving generously and cheerfully!
                </p>
                <p style="margin:0 auto 32px;max-width:440px;color:#F5EFEF;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;letter-spacing:-0.02em;">
                  I built this out of a desire to bless my local house church community in Hong Kong. Then, I felt God prompt me that it could bless many others! If there's anyone in your circle that you feel it could bless, feel free to share it :)
                </p>
                <!-- Buttons: centred row on desktop, stacked + centred on mobile -->
                <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                  <tr>
                    <td class="btn-cell" style="padding:0 6px;">
                      <a href="https://donate.stripe.com/bJe14gbwwbucdfac9E8og00"
                         style="display:inline-block;border:1.5px solid #F5EFEF;border-radius:9999px;color:#F5EFEF;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1;letter-spacing:-0.03em;text-decoration:none;padding:14px 24px;white-space:nowrap;">
                        Donate
                      </a>
                    </td>
                    <td class="btn-cell" style="padding:0 6px;">
                      <a href="https://phyto.live/about"
                         style="display:inline-block;border:1.5px solid #F5EFEF;border-radius:9999px;color:#F5EFEF;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1;letter-spacing:-0.03em;text-decoration:none;padding:14px 24px;white-space:nowrap;">
                        About
                      </a>
                    </td>
                    <td class="btn-cell" style="padding:0 6px;">
                      <a href="https://instagram.com/phyto.live"
                         style="display:inline-block;border:1.5px solid #F5EFEF;border-radius:9999px;color:#F5EFEF;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1;letter-spacing:-0.03em;text-decoration:none;padding:14px 24px;white-space:nowrap;">
                        Instagram
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- FOOTER BAR -->
            <tr>
              <td style="background:#2E7299;padding:20px 48px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td class="footer-left" style="vertical-align:middle;white-space:nowrap;">
                      <a href="https://phyto.live/terms"   style="color:#F5EFEF;font-family:'Space Mono',Courier,monospace;font-size:12px;letter-spacing:0;text-transform:uppercase;text-decoration:none;padding-right:20px;">Terms of Use</a>
                      <a href="https://phyto.live/privacy" style="color:#F5EFEF;font-family:'Space Mono',Courier,monospace;font-size:12px;letter-spacing:0;text-transform:uppercase;text-decoration:none;">Privacy Policy</a>
                    </td>
                    <td class="footer-right" align="right" style="vertical-align:middle;">
                      <a href="{{unsubscribe_url}}" style="color:#F5EFEF;font-family:'Space Mono',Courier,monospace;font-size:12px;letter-spacing:0;text-transform:uppercase;text-decoration:none;">Unsubscribe</a>
                    </td>
                  </tr>
                </table>
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
        const RESEND_TEMPLATE_ID = await readEnv("RESEND_TEMPLATE_ID");
        if (!RESEND_API_KEY || !RESEND_FROM || !RESEND_TEMPLATE_ID) {
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
        // Best-effort: log failures but don't block the response.
        const RESEND_AUDIENCE_ID = await readEnv("RESEND_AUDIENCE_ID");
        if (RESEND_AUDIENCE_ID && parsed.data.subscribe) {
          const nameParts = (name ?? "").trim().split(/\s+/);
          resend.contacts.create({
            audienceId: RESEND_AUDIENCE_ID,
            email,
            firstName: nameParts[0] ?? "",
            lastName: nameParts.slice(1).join(" ") || undefined,
            unsubscribed: false,
          }).catch((e: unknown) => {
            console.error(`Audience contact create failed: ${e instanceof Error ? e.message : String(e)}`);
          });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
