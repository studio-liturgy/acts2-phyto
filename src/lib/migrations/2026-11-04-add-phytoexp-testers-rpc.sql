-- ============================================================
-- Phyto - add_phytoexp_testers: lets the tester job add testers
-- ============================================================
-- A job on Valiant's Mac takes tester emails (from a "[Testers]" email to
-- hello@studioliturgy.com, or pasted into SL Assistant), adds the ones
-- that have a phyto account to phytoexp_testers, then sends each newly
-- added person the "You're in" email.
--
-- Access: the function only runs when p_key matches the secret held by
-- the job (only its sha256 is stored here). For each email it can only
-- (a) check whether a phyto account exists and (b) insert that email into
-- phytoexp_testers. It cannot read, edit or delete anything else, and it
-- returns only a status word per email you passed in.
--
-- "Phyto account" = a sign-in (auth.users) that owns phyto data
-- (gatherings, sets, workspace settings or a live link). An antho-only
-- sign-in shares auth.users with phyto, so it is reported as 'antho_only'
-- and not added.
--
-- Statuses: added, already (was on the list), no_account, antho_only,
-- invalid (not an email address). With p_dry_run = true nothing changes
-- and a new tester shows as would_add. At most 50 emails per call.
--
-- DATA SAFETY: additive. One new function, no table or policy changes.
-- Safe to re-run.
-- ============================================================

begin;

create or replace function public.add_phytoexp_testers(
  p_key text,
  p_emails text[],
  p_dry_run boolean default false
) returns table (email text, status text)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  e text;
  uid uuid;
  seen text[] := '{}';
begin
  if encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex')
     <> '05813360e5f515df195fd6b80fe0884ab41ab17f234e6994d883a2c9a3fed4df' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_emails is null or cardinality(p_emails) = 0 or cardinality(p_emails) > 50 then
    raise exception 'pass 1 to 50 emails' using errcode = '22023';
  end if;

  foreach e in array p_emails loop
    e := lower(trim(e));
    if e = any(seen) then
      continue;
    end if;
    seen := seen || e;
    email := e;

    if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
      status := 'invalid';
      return next;
      continue;
    end if;

    if exists (select 1 from phytoexp_testers t where lower(trim(t.email)) = e) then
      status := 'already';
      return next;
      continue;
    end if;

    select u.id into uid from auth.users u where lower(u.email) = e limit 1;
    if uid is null then
      status := 'no_account';
    elsif not (
      exists (select 1 from gatherings g where g.user_id = uid)
      or exists (select 1 from sets s where s.user_id = uid)
      or exists (select 1 from workspace_settings w where w.user_id = uid)
      or exists (select 1 from account_slugs a where a.user_id = uid)
    ) then
      status := 'antho_only';
    elsif p_dry_run then
      status := 'would_add';
    else
      insert into phytoexp_testers (email, note)
        values (e, 'added by SL Assistant tester job')
        on conflict (email) do nothing;
      status := case when found then 'added' else 'already' end;
    end if;
    return next;
  end loop;
end;
$$;

revoke all on function public.add_phytoexp_testers(text, text[], boolean) from public, authenticated;
grant execute on function public.add_phytoexp_testers(text, text[], boolean) to anon;

commit;
