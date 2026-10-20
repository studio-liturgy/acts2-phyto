/**
 * Turns a successful Stripe donation into a `transparency_entries` row for the
 * public /transparency ledger. Pure, so it is unit-tested without Stripe.
 *
 * Amounts come from the Stripe balance transaction, not the checkout session:
 * that is what actually settled in the account's currency (CAD), with Stripe's
 * fee, so it matches the hand-entered rows (e.g. 250.00 gross, 9.55 fees).
 * Donor name and email are never stored; the ledger is anonymous.
 */

/** The ledger's dates follow Hong Kong time (Valiant's choice). */
export const LEDGER_TIME_ZONE = "Asia/Hong_Kong";

/** The fields of a Stripe balance transaction this needs. Amounts are in the
 *  currency's minor unit (cents), as Stripe sends them. */
export interface BalanceTxnLike {
  amount: number;
  fee: number;
  currency: string;
  /** Unix seconds. */
  created: number;
}

export interface DonationEntry {
  type: "donation";
  entry_date: string;
  amount: number;
  fees: number;
  currency: string;
  stripe_payment_id: string;
}

/** YYYY-MM-DD for a Unix-seconds timestamp, in the ledger's time zone. */
export function ledgerDate(unixSeconds: number, timeZone: string = LEDGER_TIME_ZONE): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(unixSeconds * 1000));
}

export function donationEntry(paymentIntentId: string, txn: BalanceTxnLike): DonationEntry {
  return {
    type: "donation",
    entry_date: ledgerDate(txn.created),
    amount: txn.amount / 100,
    fees: txn.fee / 100,
    currency: txn.currency.toUpperCase(),
    stripe_payment_id: paymentIntentId,
  };
}

/** Where a webhook event's ledger row comes from, or null when it logs nothing.
 *  - One-time gift: the checkout session carries its PaymentIntent.
 *  - Subscription (first month and every renewal): the checkout session has no
 *    PaymentIntent, so it logs nothing; the `invoice.paid` event that follows
 *    each payment is logged from its invoice instead.
 *  Test-mode events never reach the public ledger (one Supabase project serves
 *  prod and test). */
export type DonationSource =
  | { kind: "payment_intent"; id: string }
  | { kind: "invoice"; id: string };

export interface WebhookEventLike {
  type: string;
  livemode: boolean;
  data: {
    object: {
      id?: string;
      mode?: string | null;
      payment_status?: string | null;
      payment_intent?: string | { id: string } | null;
      amount_paid?: number | null;
    };
  };
}

export function donationSource(event: WebhookEventLike): DonationSource | null {
  if (!event.livemode) return null;
  const obj = event.data.object;

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    // A delayed payment method completes as "unpaid" and is logged by the
    // later async_payment_succeeded event instead.
    if (obj.mode !== "payment" || obj.payment_status !== "paid") return null;
    const pi = typeof obj.payment_intent === "string" ? obj.payment_intent : obj.payment_intent?.id;
    return pi ? { kind: "payment_intent", id: pi } : null;
  }

  if (event.type === "invoice.paid") {
    // A $0 invoice (trial, 100% coupon) has no payment to log.
    if (!obj.id || !obj.amount_paid) return null;
    return { kind: "invoice", id: obj.id };
  }

  return null;
}

/** The PaymentIntent that paid an invoice, from its invoice payments list. */
export function paidInvoicePaymentIntent(
  payments: {
    status: string;
    payment: { type: string; payment_intent?: string | { id: string } | null };
  }[],
): string | null {
  for (const p of payments) {
    if (p.status !== "paid" || p.payment.type !== "payment_intent") continue;
    const pi = p.payment.payment_intent;
    const id = typeof pi === "string" ? pi : pi?.id;
    if (id) return id;
  }
  return null;
}
