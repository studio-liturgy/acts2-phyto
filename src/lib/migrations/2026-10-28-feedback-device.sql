-- ============================================================
-- Phyto - feedback: the tester's device (phytoexp.live form)
-- ============================================================
-- The phytoexp feedback form asks mobile testers for their device type
-- (Phone / Tablet / Computer) and model. phyto.live never sends them.
--
-- DATA SAFETY: additive only. Adds two nullable columns; no row is changed,
-- no policy changes (inserts go through the service role). Safe to re-run.
-- Until applied, feedback sent from phytoexp fails to save, so apply this
-- before the form change is pushed to test.
-- ============================================================

begin;

alter table public.feedback add column if not exists device text;
alter table public.feedback add column if not exists device_model text;

commit;
