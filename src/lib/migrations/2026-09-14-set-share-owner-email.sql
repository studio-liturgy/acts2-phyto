-- ============================================================
-- Phyto - set_shares.owner_email (Stage 3 follow-up)
-- ============================================================
-- Denormalizes the owner's email onto each share so the recipient can see who a
-- set was shared BY (the inbox) and who OWNS a saved set (the set editor).
-- auth.users emails aren't readable via RLS, so the owner writes their own email
-- at share time.
--
-- DATA SAFETY: additive only. Adds one nullable column; no row is deleted,
-- updated, or truncated, and no table/column is dropped. Wrapped in a
-- transaction (all-or-nothing). Safe on the shared prod+test database and safe
-- to re-run. Existing shares simply have a null owner_email until re-created.
-- ============================================================

begin;

alter table set_shares add column if not exists owner_email text;

commit;
