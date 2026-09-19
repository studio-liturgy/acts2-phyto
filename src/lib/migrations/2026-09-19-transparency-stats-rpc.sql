-- ============================================================
-- Phyto - get_transparency_stats(): fast account/set counts
-- ============================================================
-- /api/public/stats previously called supabase.auth.admin.listUsers()
-- to get a total account count, plus a separate PostgREST count query
-- on `sets`. The GoTrue admin API is a separate service hop and was
-- taking multiple seconds end to end. This single SQL function does
-- both counts as one plain (fast, indexed) Postgres query instead.
--
-- SECURITY DEFINER is required only so this can count auth.users,
-- which anon/service_role can't query directly. It returns nothing
-- but two integers - no row data, no PII - and is granted to
-- service_role only (called server-side with the service role key,
-- same as before).
--
-- DATA SAFETY: purely additive, no existing table/function touched.
-- Safe to re-run; safe on the shared prod+test DB.
-- ============================================================

begin;

create or replace function public.get_transparency_stats()
returns table (accounts bigint, sets bigint)
language sql
security definer
set search_path = public, auth
as $$
  select
    (select count(*) from auth.users) as accounts,
    (select count(*) from public.sets) as sets;
$$;

revoke all on function public.get_transparency_stats() from public;
grant execute on function public.get_transparency_stats() to service_role;

commit;
