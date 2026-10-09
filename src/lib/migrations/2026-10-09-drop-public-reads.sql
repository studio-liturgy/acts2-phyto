-- ============================================================
-- Phyto - close anonymous reads on sets, gatherings, gathering_sets
-- ============================================================
-- Run ONLY after the get_share_view viewer is live on BOTH phytoexp.live and
-- phyto.live (shipped to main 2026-10-09, e38ea47). The viewer no longer reads
-- these tables directly, so these three "anyone can read" policies have no
-- remaining purpose and let the public anon key list every gathering (with its
-- share link) across all accounts, plus the full content of every live set.
--
-- Signed-in access is unchanged: each table keeps its own "member select"
-- policy (owner, group member, or shared-with). The /g viewer keeps working
-- through get_share_view(), which is security definer and unaffected.
--
-- Effects:
--   - An anon read of sets, gatherings or gathering_sets returns zero rows.
--   - Restores the invariant the sync guard (src/lib/sync.ts, fetchRemote)
--     relies on: an unauthenticated sets read returns ZERO rows.
--   - Phones still showing the OLD viewer (opened before today's deploy) stop
--     updating until refreshed.
--
-- DATA SAFETY: drops three policies only. No table, row or function changed.
-- Safe to re-run. Rollback block at the bottom.
-- ============================================================

begin;

drop policy if exists "sets: public select when gathering is live" on sets;
drop policy if exists "gatherings: public select by share_token" on gatherings;
drop policy if exists "gathering_sets: public select when live" on gathering_sets;

commit;

-- ROLLBACK (only if something breaks): recreates the three policies exactly as
-- they were in the live DB on 2026-10-09.
--
-- create policy "sets: public select when gathering is live" on sets for select
--   using (exists (select 1 from gathering_sets gs
--                  join gatherings g on g.id = gs.gathering_id
--                  where gs.set_id = sets.id and g.is_live = true));
-- create policy "gatherings: public select by share_token" on gatherings for select
--   using (share_token is not null);
-- create policy "gathering_sets: public select when live" on gathering_sets for select
--   using (exists (select 1 from gatherings g
--                  where g.id = gathering_sets.gathering_id and g.is_live = true
--                    and g.live_started_at > now() - interval '24 hours'));
