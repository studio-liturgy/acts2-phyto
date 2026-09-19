-- ============================================================
-- Phyto - transparency_entries: public donations/expenses ledger
-- ============================================================
-- Backs the /transparency page. Each row is one line item: a donation
-- received or an expense paid, shown publicly so donors can see what
-- their money goes to (see the donation thank-you email).
--
-- Columns mirror the existing Donations / Expenses tracking sheets:
--   donation: entry_date, amount (gross), fees            -> net_amount is generated
--   expense:  entry_date, description, amount (fees = 0)  -> net_amount = amount
--
-- Editing: rows are added/edited directly in the Supabase Studio Table
-- Editor (which connects with elevated privileges and bypasses RLS), not
-- through the app. The table is intentionally read-only from the app's
-- anon key - there is no insert/update/delete policy for anon/authenticated,
-- so the public site can only ever SELECT.
--
-- DATA SAFETY: purely additive. Creates ONE new table + its RLS policy.
-- Does not touch any existing table. All-or-nothing; safe to re-run; safe
-- on the shared prod+test DB.
-- ============================================================

begin;

create table if not exists transparency_entries (
  id          uuid        primary key default gen_random_uuid(),
  -- 'donation' (money in) or 'expense' (money out).
  type        text        not null check (type in ('donation', 'expense')),
  entry_date  date        not null default current_date,
  -- Required for expenses (e.g. "Cloudflare - Domain"); donations don't need one.
  description text,
  -- Gross amount in `currency`'s smallest-common unit (e.g. dollars, not cents).
  amount      numeric(12, 2) not null check (amount >= 0),
  -- Payment-processor fees withheld from a donation. Always 0 for expenses.
  fees        numeric(12, 2) not null default 0 check (fees >= 0),
  currency    text        not null default 'CAD',
  -- What actually landed / was paid: amount - fees. ("Total Amount" column.)
  net_amount  numeric(12, 2) generated always as (amount - fees) stored,
  created_at  timestamptz not null default now(),
  constraint transparency_entries_expense_needs_description
    check (type <> 'expense' or description is not null)
);

create index if not exists transparency_entries_date_idx
  on transparency_entries (entry_date desc);

alter table transparency_entries enable row level security;

-- Public ledger: anyone can read every row. No write policies are defined
-- for anon/authenticated on purpose - see the editing note above.
drop policy if exists "transparency_entries: public select" on transparency_entries;
create policy "transparency_entries: public select"
  on transparency_entries for select
  using (true);

commit;
