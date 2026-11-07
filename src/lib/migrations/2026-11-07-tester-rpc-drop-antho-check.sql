-- ============================================================
-- Phyto - add_phytoexp_testers: any sign-in counts as a phyto account
-- ============================================================
-- Replaces 2026-11-04-add-phytoexp-testers-rpc.sql. That version required
-- the auth.users row to own phyto data (a gathering, set, workspace_settings
-- or account_slugs row) before counting it as a "phyto account", and
-- reported a bare sign-in as 'antho_only' (skipped, not added).
--
-- Valiant's call (2026-11-07): ignore antho entirely until he works on it
-- himself, which is far in the future (after the phyto mobile release).
-- Until then, any auth.users row under the email is a phyto account,
-- full stop. The 'antho_only' status is removed; a bare sign-in with no
-- phyto data now gets 'added' like anyone else.
--
-- Statuses: added, already, no_account, invalid. With p_dry_run = true
-- nothing changes and a new tester shows as would_add. At most 50 emails
-- per call. Same p_key gate as before (same secret, same sha256).
--
-- DATA SAFETY: additive. Replaces one function body only, no table or
-- policy changes. Safe to re-run.
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
