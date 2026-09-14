-- ============================================================
-- Phyto - user_id_for_email() (Stage 3 follow-up)
-- ============================================================
-- Lets the client resolve an email to an account id, so a set can only be shared
-- with people who already have a phyto account (and so the grant can be attached
-- to the recipient immediately). auth.users is not readable via RLS; a
-- SECURITY DEFINER function is the safe, minimal way to answer "does this email
-- have an account?". Restricted to signed-in callers to limit enumeration.
--
-- DATA SAFETY: additive only. Creates one function and adjusts its execute
-- grants; no table/column/row is created, changed, dropped, or truncated. Wrapped
-- in a transaction (all-or-nothing). Safe on the shared prod+test database and
-- safe to re-run.
-- ============================================================

begin;

create or replace function user_id_for_email(p_email text)
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

-- Only authenticated users may resolve an email to an account.
revoke execute on function user_id_for_email(text) from public, anon;
grant execute on function user_id_for_email(text) to authenticated;

commit;
