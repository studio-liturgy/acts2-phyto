import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { readEnv } from "@/lib/worker-env";
import {
  donationEntry,
  donationSource,
  paidInvoicePaymentIntent,
  type DonationSource,
} from "@/lib/donation-entry";

// Fired by Stripe for donations made through the donate.stripe.com Payment
// Link used by /donate (see src/routes/donate.ts).
// 1. Sends a thank-you email via a Resend dashboard template, once, when the
//    checkout completes (a subscription's renewals get no email).
// 2. Logs each payment on the public /transparency ledger
//    (transparency_entries), with Stripe's settled amount and fee. One-time
//    gifts are logged from the checkout session; subscription payments (first
//    month and renewals) from `invoice.paid`.
//
// Setup (one-time, in the Stripe Dashboard):
//   Developers > Webhooks > Add destination
//     URL: https://phyto.live/api/webhooks/stripe
//     Events: checkout.session.completed, checkout.session.async_payment_succeeded,
//             invoice.paid
//   Copy the signing secret into STRIPE_WEBHOOK_SECRET (wrangler secret).
//   Ledger logging also needs STRIPE_SECRET_KEY: a restricted key with READ on
//   PaymentIntents, Charges, Balance and Invoices (the fee is only on the
//   balance transaction, which the webhook payload doesn't include).
//
// A ledger failure answers Stripe with a 500 so Stripe retries the event. The
// thank-you email is sent only once the ledger step has succeeded (or had
// nothing to log), so a retry never emails the donor twice.

type LedgerResult = "ok" | "retry";

/** Fetch the settled amount + fee for a payment and insert the ledger row.
 *  Returns "retry" when Stripe should resend the event. A duplicate (Stripe
 *  retry after a success) hits the unique index on stripe_payment_id and
 *  counts as done. */
async function logDonation(source: DonationSource): Promise<LedgerResult> {
  try {
    const STRIPE_SECRET_KEY = await readEnv("STRIPE_SECRET_KEY");
    const SUPABASE_URL = await readEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = await readEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Donation ledger: not configured (STRIPE_SECRET_KEY / Supabase).");
      return "retry";
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    let paymentIntentId: string | null = source.kind === "payment_intent" ? source.id : null;
    if (source.kind === "invoice") {
      const payments = await stripe.invoicePayments.list({ invoice: source.id, status: "paid" });
      paymentIntentId = paidInvoicePaymentIntent(payments.data);
      if (!paymentIntentId) {
        console.error(`Donation ledger: no paid PaymentIntent on invoice ${source.id}.`);
        return "retry";
      }
    }
    if (!paymentIntentId) return "retry";

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge.balance_transaction"],
    });
    const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
    const txn =
      charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
    if (!txn) {
      console.error(`Donation ledger: no balance transaction yet for ${paymentIntentId}.`);
      return "retry";
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await supabase
      .from("transparency_entries")
      .insert(donationEntry(paymentIntentId, txn));
    if (error && error.code !== "23505") {
      console.error(`Donation ledger: insert failed for ${paymentIntentId}: ${error.message}`);
      return "retry";
    }
    return "ok";
  } catch (e) {
    console.error(
      `Donation ledger: failed for ${source.kind} ${source.id}: ${e instanceof Error ? e.message : String(e)}`,
    );
    return "retry";
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
          event.type !== "checkout.session.async_payment_succeeded" &&
          event.type !== "invoice.paid"
        ) {
          return Response.json({ ok: true, skipped: event.type });
        }

        // Ledger first, inline: a failure makes Stripe retry the whole event,
        // before any email goes out.
        const source = donationSource(event);
        if (source && (await logDonation(source)) === "retry") {
          return Response.json({ ok: false, error: "Ledger not logged." }, { status: 500 });
        }

        // Thank-you email: once, on checkout completion (first payment only).
        if (event.type === "checkout.session.completed") {
          const session = event.data.object;
          const email = session.customer_details?.email;
          if (email) await runInBackground([sendThankYou(session, email)]);
        }

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
