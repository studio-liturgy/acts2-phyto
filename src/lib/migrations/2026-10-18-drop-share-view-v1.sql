-- ============================================================
-- Phyto - drop get_share_view() (superseded by get_share_view_v2)
-- ============================================================
-- Step two of the 2026-10-18 rollout. Both phyto.live and phytoexp.live now
-- call get_share_view_v2 (2026-10-18-share-view-versioned.sql). Nothing in
-- phyto or antho calls the old function any more; only a viewer tab still
-- running the pre-October 18 bundle would, and it holds its slides and keeps
-- retrying until reloaded.
--
-- DATA SAFETY: drops one function; no table, row or policy touched. Safe to
-- re-run; safe on the shared prod+test DB.
-- ============================================================

drop function if exists public.get_share_view(text);
