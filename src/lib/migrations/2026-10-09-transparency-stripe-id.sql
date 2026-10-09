-- ============================================================
-- Phyto - transparency_entries.stripe_payment_id: auto-logged donations
-- ============================================================
-- The Stripe webhook (src/routes/api/webhooks/stripe.ts) now writes a
-- `donation` row for every successful live-mode donation. Stripe retries
-- webhooks, so each row carries the Stripe PaymentIntent id and a unique index
-- rejects a second insert for the same payment.
--
-- Rows entered by hand in the Table Editor leave it null (the index ignores
-- nulls), so existing rows and manual expenses are unaffected.
--
-- DATA SAFETY: purely additive. One nullable column + one partial unique
-- index. No existing row changes. Safe to re-run; safe on the shared
-- prod+test DB.
-- ============================================================

begin;

alter table transparency_entries
  add column if not exists stripe_payment_id text;

create unique index if not exists transparency_entries_stripe_payment_id_key
  on transparency_entries (stripe_payment_id)
  where stripe_payment_id is not null;

commit;
