import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { readEnv } from "@/lib/worker-env";
import { donationEntry } from "@/lib/donation-entry";

// Fired by Stripe when someone completes a checkout — including the
// donate.stripe.com Payment Link used by /donate (see src/routes/donate.ts).
// 1. Sends a thank-you email via a Resend dashboard template.
// 2. Logs the donation on the public /transparency ledger
//    (transparency_entries), with Stripe's settled amount and fee.
//
// Setup (one-time, in the Stripe Dashboard):
//   Developers > Webhooks > Add endpoint
//     URL: https://phyto.live/api/webhooks/stripe
//     Events: checkout.session.completed (and, for delayed payment methods,
//             checkout.session.async_payment_succeeded)
//   Copy the signing secret into STRIPE_WEBHOOK_SECRET (wrangler secret).
//   Ledger logging also needs STRIPE_SECRET_KEY: a restricted key with READ on
//   PaymentIntents, Charges and Balance (the fee is only on the balance
//   transaction, which the webhook payload doesn't include).

/** Fetch the settled amount + fee for a payment and insert the ledger row.
 *  Never throws: a logging failure must not affect the thank-you email or the
 *  response to Stripe. A duplicate (Stripe retry) hits the unique index on
 *  stripe_payment_id and is ignored. */
async function logDonation(paymentIntentId: string): Promise<void> {
  try {
    const STRIPE_SECRET_KEY = await readEnv("STRIPE_SECRET_KEY");
    const SUPABASE_URL = await readEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = await readEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Donation ledger: not configured (STRIPE_SECRET_KEY / Supabase).");
      return;
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      httpClient: Stripe.createFetchHttpClient(),
    });
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge.balance_transaction"],
    });
    const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
    const txn =
      charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
    if (!txn) {
      console.error(`Donation ledger: no balance transaction yet for ${paymentIntentId}.`);
      return;
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await supabase
      .from("transparency_entries")
      .insert(donationEntry(paymentIntentId, txn));
    if (error && error.code !== "23505") {
      console.error(`Donation ledger: insert failed for ${paymentIntentId}: ${error.message}`);
    }
  } catch (e) {
    console.error(
      `Donation ledger: failed for ${paymentIntentId}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/** Run background work past the response (Worker), or inline elsewhere. */
async function runInBackground(tasks: Promise<unknown>[]): Promise<void> {
  if (!tasks.length) return;
  const all = Promise.all(tasks);
  try {
    const { waitUntil } = await import("cloudflare:workers");
    waitUntil(all);
  } catch {
    await all;
  }
}

export const Route = createFileRoute("/api/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const STRIPE_WEBHOOK_SECRET = await readEnv("STRIPE_WEBHOOK_SECRET");
        if (!STRIPE_WEBHOOK_SECRET) {
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

        if (
          event.type !== "checkout.session.completed" &&
          event.type !== "checkout.session.async_payment_succeeded"
        ) {
          return Response.json({ ok: true, skipped: event.type });
        }

        const session = event.data.object;
        const tasks: Promise<unknown>[] = [];

        // Ledger: live-mode, paid sessions only. Test-mode payments must never
        // reach the public ledger (one Supabase project serves prod and test).
        // A delayed payment method completes as "unpaid" and is logged by the
        // later async_payment_succeeded event instead.
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id;
        if (event.livemode && session.payment_status === "paid" && paymentIntentId) {
          tasks.push(logDonation(paymentIntentId));
        }

        // Thank-you email: once, on checkout completion.
        const email = session.customer_details?.email;
        if (event.type === "checkout.session.completed" && email) {
          tasks.push(sendThankYou(session, email));
        }

        // Respond to Stripe immediately; keep the Worker alive long enough for
        // the background work to finish (same pattern as the welcome email's
        // audience-contact call in src/routes/api/auth/welcome.ts).
        await runInBackground(tasks);

        return Response.json({ ok: true });
      },
    },
  },
});

async function sendThankYou(session: Stripe.Checkout.Session, email: string): Promise<void> {
  const RESEND_API_KEY = await readEnv("RESEND_API_KEY");
  const RESEND_FROM = await readEnv("RESEND_FROM");
  const RESEND_DONATION_TEMPLATE_ID = await readEnv("RESEND_DONATION_TEMPLATE_ID");
  if (!RESEND_API_KEY || !RESEND_FROM || !RESEND_DONATION_TEMPLATE_ID) {
    console.error("Donation thank-you email is not configured.");
    return;
  }

  const name = session.customer_details?.name ?? "";
  const amount =
    typeof session.amount_total === "number" ? (session.amount_total / 100).toFixed(2) : "";
  const currency = session.currency?.toUpperCase() ?? "";

  try {
    const res = await new Resend(RESEND_API_KEY).emails.send({
      from: RESEND_FROM,
      to: email,
      subject: "Thank you for your gift to phyto",
      template: {
        id: RESEND_DONATION_TEMPLATE_ID,
        variables: { name, amount, currency },
      },
    });
    if (res.error) console.error(`Donation thank-you email failed: ${res.error.message}`);
  } catch (e) {
    console.error(`Donation thank-you email failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
