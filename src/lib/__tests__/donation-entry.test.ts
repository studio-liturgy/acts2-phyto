import { describe, it, expect } from "vitest";
import {
  donationEntry,
  donationSource,
  ledgerDate,
  paidInvoicePaymentIntent,
  type WebhookEventLike,
} from "../donation-entry";

const unix = (iso: string) => Date.parse(iso) / 1000;

describe("ledgerDate", () => {
  it("uses Hong Kong time, so a late-UTC payment lands on the next day", () => {
    // 16:30 UTC on 20 Sep is 00:30 on 21 Sep in Hong Kong (UTC+8).
    expect(ledgerDate(unix("2026-09-20T16:30:00Z"))).toBe("2026-09-21");
    expect(ledgerDate(unix("2026-09-20T15:59:59Z"))).toBe("2026-09-20");
  });
});

describe("donationEntry", () => {
  it("maps Stripe's settled amount and fee (cents) to a ledger row", () => {
    expect(
      donationEntry("pi_123", {
        amount: 25000,
        fee: 955,
        currency: "cad",
        created: unix("2026-09-20T03:00:00Z"),
      }),
    ).toEqual({
      type: "donation",
      entry_date: "2026-09-20",
      amount: 250,
      fees: 9.55,
      currency: "CAD",
      stripe_payment_id: "pi_123",
    });
  });

  it("never carries donor details", () => {
    const row = donationEntry("pi_1", { amount: 1000, fee: 67, currency: "cad", created: 0 });
    expect(Object.keys(row).sort()).toEqual(
      ["amount", "currency", "entry_date", "fees", "stripe_payment_id", "type"].sort(),
    );
  });
});

const ev = (
  type: string,
  object: WebhookEventLike["data"]["object"],
  livemode = true,
): WebhookEventLike => ({ type, livemode, data: { object } });

describe("donationSource", () => {
  it("logs a paid one-time checkout from its PaymentIntent", () => {
    expect(
      donationSource(
        ev("checkout.session.completed", {
          mode: "payment",
          payment_status: "paid",
          payment_intent: "pi_1",
        }),
      ),
    ).toEqual({ kind: "payment_intent", id: "pi_1" });
  });

  it("skips a subscription checkout: its payment is logged from invoice.paid", () => {
    // The real failure: a subscription checkout carries no payment_intent.
    expect(
      donationSource(
        ev("checkout.session.completed", {
          mode: "subscription",
          payment_status: "paid",
          payment_intent: null,
        }),
      ),
    ).toBeNull();
  });

  it("logs every paid subscription invoice, first month and renewals", () => {
    expect(donationSource(ev("invoice.paid", { id: "in_1", amount_paid: 1000 }))).toEqual({
      kind: "invoice",
      id: "in_1",
    });
  });

  it("skips $0 invoices, unpaid async checkouts and test mode", () => {
    expect(donationSource(ev("invoice.paid", { id: "in_0", amount_paid: 0 }))).toBeNull();
    expect(
      donationSource(
        ev("checkout.session.completed", {
          mode: "payment",
          payment_status: "unpaid",
          payment_intent: "pi_2",
        }),
      ),
    ).toBeNull();
    expect(donationSource(ev("invoice.paid", { id: "in_1", amount_paid: 1000 }, false))).toBeNull();
  });
});

describe("paidInvoicePaymentIntent", () => {
  it("picks the paid PaymentIntent and ignores open or canceled attempts", () => {
    expect(
      paidInvoicePaymentIntent([
        { status: "canceled", payment: { type: "payment_intent", payment_intent: "pi_old" } },
        { status: "paid", payment: { type: "payment_intent", payment_intent: { id: "pi_ok" } } },
      ]),
    ).toBe("pi_ok");
    expect(paidInvoicePaymentIntent([])).toBeNull();
  });
});
