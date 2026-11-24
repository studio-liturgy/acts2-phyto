-- ============================================================
-- Phyto - log_donation: lets Valiant's assistant add donations
-- ============================================================
-- Stripe donations log themselves (webhook). Gifts that don't go
-- through Stripe (e-transfer, cash) are added through this function
-- by a script on Valiant's Mac, so no SQL is needed for each one.
--
-- Access: the function only runs when p_key matches the secret held by
-- the script (only its sha256 is stored here). It can only INSERT
-- donation rows; it cannot read, edit or delete anything. Amounts are
-- capped at 1000 to stop a typo.
--
-- receipt_ref (e.g. "manual:2026-11-23:100.00:1") makes each gift log
-- once, however many times the script runs.
--
-- Also adds the CAD 100.00 donation of Nov 23, 2026 (no fees).
--
-- DATA SAFETY: additive. One function and one donation row. Safe to
-- re-run: the row is skipped if it's already there.
-- ============================================================

begin;

create or replace function log_donation(
  p_key text,
  p_ref text,
  p_date date,
  p_amount numeric,
  p_fees numeric default 0,
  p_currency text default 'CAD'
) returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex')
     <> '90e92af7d91b5eecffad72431da9ab8630d9edc4ea592fb1cc3e263876fd93a4' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce(trim(p_ref), '') = '' or p_date is null
     or p_amount is null or p_amount <= 0 or p_amount > 1000
     or coalesce(p_fees, 0) < 0 or coalesce(p_fees, 0) >= p_amount then
    raise exception 'bad entry' using errcode = '22023';
  end if;
  insert into transparency_entries
    (type, entry_date, amount, fees, currency, receipt_ref)
  values
    ('donation', p_date, round(p_amount, 2), round(coalesce(p_fees, 0), 2),
     coalesce(p_currency, 'CAD'), p_ref)
  on conflict (receipt_ref) where receipt_ref is not null do nothing;
  if found then
    return 'inserted';
  end if;
  return 'exists';
end;
$$;

revoke all on function log_donation(text, text, date, numeric, numeric, text) from public, authenticated;
grant execute on function log_donation(text, text, date, numeric, numeric, text) to anon;

insert into transparency_entries
  (type, entry_date, amount, fees, currency, receipt_ref)
values
  ('donation', '2026-11-23', 100.00, 0, 'CAD', 'manual:2026-11-23:100.00:1')
on conflict (receipt_ref) where receipt_ref is not null do nothing;

commit;
