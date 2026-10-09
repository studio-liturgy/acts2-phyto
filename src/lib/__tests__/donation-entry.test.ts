import { describe, it, expect } from "vitest";
import { donationEntry, ledgerDate } from "../donation-entry";

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
