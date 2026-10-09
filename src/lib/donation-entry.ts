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
