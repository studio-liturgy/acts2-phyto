-- ============================================================
-- Phyto - log_expense: lets the receipt job add expense rows
-- ============================================================
-- A daily job on Valiant's Mac reads vendor receipts (Anthropic,
-- Cloudflare) in hello@studioliturgy.com and logs each one into
-- transparency_entries through this function.
--
-- Access: the function only runs when p_key matches the secret held by
-- the job (only its sha256 is stored here). It can only INSERT expense
-- rows; it cannot read, edit or delete anything. Amounts are capped at
-- 500 to stop a misread receipt.
--
-- receipt_ref (e.g. "anthropic:2106-1829-0960") makes each receipt log
-- once, however many times the job runs.
--
-- DATA SAFETY: additive. One new column, one partial unique index, one
-- function. The update only tags the Oct 28 Claude Pro row if it was
-- already added by hand, so the job doesn't add it twice.
-- ============================================================

begin;

alter table transparency_entries
  add column if not exists receipt_ref text;

create unique index if not exists transparency_entries_receipt_ref_key
  on transparency_entries (receipt_ref)
  where receipt_ref is not null;

update transparency_entries
  set receipt_ref = 'anthropic:2106-1829-0960'
  where type = 'expense'
    and description = 'Anthropic - Claude Pro Subscription'
    and entry_date in ('2026-10-28', '2026-10-29')
    and receipt_ref is null;

create or replace function log_expense(
  p_key text,
  p_ref text,
  p_date date,
  p_description text,
  p_amount numeric,
  p_currency text default 'CAD'
) returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex')
     <> '982db6328a27d94e51252292482951d0bb0607a3c093ed939f55ff354b0312a7' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_ref is null or p_date is null or coalesce(trim(p_description), '') = ''
     or p_amount is null or p_amount <= 0 or p_amount > 500 then
    raise exception 'bad entry' using errcode = '22023';
  end if;
  insert into transparency_entries
    (type, entry_date, description, amount, fees, currency, receipt_ref)
  values
    ('expense', p_date, p_description, round(p_amount, 2), 0,
     coalesce(p_currency, 'CAD'), p_ref)
  on conflict (receipt_ref) where receipt_ref is not null do nothing;
  if found then
    return 'inserted';
  end if;
  return 'exists';
end;
$$;

revoke all on function log_expense(text, text, date, text, numeric, text) from public, authenticated;
grant execute on function log_expense(text, text, date, text, numeric, text) to anon;

commit;
