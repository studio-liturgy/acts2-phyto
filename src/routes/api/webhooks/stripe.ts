import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { Resend } from "resend";
import { readEnv } from "@/lib/worker-env";

// Fired by Stripe when someone completes a checkout — including the
// donate.stripe.com Payment Link used by /donate (see src/routes/donate.ts).
// Sends a thank-you email via a Resend dashboard template.
//
// Setup (one-time, in the Stripe Dashboard):
//   Developers > Webhooks > Add endpoint
//     URL: https://phyto.live/api/webhooks/stripe
//     Events: checkout.session.completed
//   Copy the signing secret into STRIPE_WEBHOOK_SECRET (wrangler secret).
export const Route = createFileRoute("/api/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const STRIPE_WEBHOOK_SECRET = await readEnv("STRIPE_WEBHOOK_SECRET");
        const RESEND_API_KEY = await readEnv("RESEND_API_KEY");
        const RESEND_FROM = await readEnv("RESEND_FROM");
        const RESEND_DONATION_TEMPLATE_ID = await readEnv("RESEND_DONATION_TEMPLATE_ID");
        if (
          !STRIPE_WEBHOOK_SECRET ||
          !RESEND_API_KEY ||
          !RESEND_FROM ||
          !RESEND_DONATION_TEMPLATE_ID
        ) {
          console.error("Stripe webhook is not configured.");
          return Response.json({ ok: false, error: "Not configured." }, { status: 500 });
        }

        const signature = request.headers.get("stripe-signature");
        const payload = await request.text();
        if (!signature) {
          return Response.json({ ok: false, error: "Missing signature." }, { status: 400 });
        }

        // constructEventAsync uses SubtleCrypto (no Node APIs), so it works
        // in the Cloudflare Workers runtime. No Stripe API key is needed
        // just to verify + read the webhook payload.
        let event: Stripe.Event;
        try {
          event = await Stripe.webhooks.constructEventAsync(
            payload,
            signature,
            STRIPE_WEBHOOK_SECRET,
          );
        } catch (err) {
          console.error(
            `Stripe webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          return Response.json({ ok: false, error: "Invalid signature." }, { status: 400 });
        }

        if (event.type !== "checkout.session.completed") {
          return Response.json({ ok: true, skipped: event.type });
        }

        const session = event.data.object;
        const email = session.customer_details?.email;
        if (!email) {
          // No email to send to (e.g. incomplete customer details) — ack anyway
          // so Stripe doesn't retry.
          return Response.json({ ok: true, skipped: "no_email" });
        }

        const name = session.customer_details?.name ?? "";
        const amount =
          typeof session.amount_total === "number" ? (session.amount_total / 100).toFixed(2) : "";
        const currency = session.currency?.toUpperCase() ?? "";

        const resend = new Resend(RESEND_API_KEY);
        const sendThankYou = resend.emails
          .send({
            from: RESEND_FROM,
            to: email,
            subject: "Thank you for your gift to phyto",
            template: {
              id: RESEND_DONATION_TEMPLATE_ID,
              variables: { name, amount, currency },
            },
          })
          .then((res) => {
            if (res.error) {
              console.error(`Donation thank-you email failed: ${res.error.message}`);
            }
          })
          .catch((e: unknown) => {
            console.error(
              `Donation thank-you email failed: ${e instanceof Error ? e.message : String(e)}`,
            );
          });

        // Respond to Stripe immediately; keep the Worker alive long enough
        // for the Resend request to finish (same pattern as the welcome
        // email's audience-contact call in src/routes/api/auth/welcome.ts).
        try {
          const { waitUntil } = await import("cloudflare:workers");
          waitUntil(sendThankYou);
        } catch {
          await sendThankYou;
        }

        return Response.json({ ok: true });
      },
    },
  },
});
