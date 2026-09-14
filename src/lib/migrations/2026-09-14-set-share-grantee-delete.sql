-- ============================================================
-- Phyto - set_shares grantee self-delete (Stage 3 fix)
-- ============================================================
-- Lets a grantee REMOVE THEMSELVES from a shared set (dismiss / remove). The
-- original policy only allowed the owner to delete a grant, so a grantee's
-- self-removal deleted zero rows and the share reappeared on refresh.
--
-- DATA SAFETY: additive only. Adds one RLS policy (RLS is the OR of all
-- policies, so the existing owner-delete policy is unchanged). No row is
-- deleted, updated, or truncated; nothing is dropped except the policy of the
-- same name if a prior attempt created it (recreated in the same transaction).
-- Wrapped in a transaction (all-or-nothing). Safe on the shared prod+test DB and
-- safe to re-run.
-- ============================================================

begin;

drop policy if exists "set_shares: grantee delete" on set_shares;
create policy "set_shares: grantee delete" on set_shares for delete
  using (grantee_user_id = auth.uid());

commit;
