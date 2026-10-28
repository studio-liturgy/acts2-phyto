-- ============================================================
-- Phyto - phytoexp.live tester allow list
-- ============================================================
-- phytoexp.live (the test build) only lets in emails listed here. Add or
-- remove a tester in Table Editor > phytoexp_testers. Matching ignores case
-- and surrounding spaces. phyto.live never reads this table.
--
-- DATA SAFETY: additive only. New table (RLS on, no policies, so nobody can
-- list it through the API) and one yes/no RPC. No existing row or policy
-- changes. Safe to re-run.
-- ============================================================

begin;

create table if not exists public.phytoexp_testers (
  email text primary key,
  note text,
  added_at timestamptz not null default now()
);

alter table public.phytoexp_testers enable row level security;
revoke all on public.phytoexp_testers from anon, authenticated;

create or replace function public.is_phytoexp_tester(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.phytoexp_testers
    where lower(trim(email)) = lower(trim(p_email))
  );
$$;

revoke all on function public.is_phytoexp_tester(text) from public;
grant execute on function public.is_phytoexp_tester(text) to anon, authenticated;

commit;
